import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  KeyboardAvoidingView, Platform, SafeAreaView,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { invokeAgent, AgentContext } from '../services/supabase';

// ── Theme (matches WorkoutPlanScreen) ───────────────────────────
const BG         = '#0D0D0D';
const CARD_BG    = '#1A1A1A';
const ROW_BG     = '#242424';
const CHARTREUSE = '#CFFF00';
const WHITE      = '#FFFFFF';
const GRAY       = '#888888';
const BORDER     = '#2A2A2A';
const NEON       = '#00F5FF';

export type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

type PendingProposal = {
  proposed_plan: unknown[];
  change_summary: string;
  plan_id: string;
} | null;

type ChatViewProps = {
  initialMessages?: Message[];
  context?: AgentContext;
  onBack: () => void;
  isModal: boolean;
};

export const ChatView = ({ initialMessages, context, onBack, isModal }: ChatViewProps) => {
  const [messages, setMessages] = useState<Message[]>(
    initialMessages && initialMessages.length > 0
      ? initialMessages
      : [{ id: 'greeting', role: 'model', text: "Hey! I'm your AI Coach. How can I help you today?" }]
  );
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal>(null);
  const flatListRef = useRef<FlatList>(null);

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const userText = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    setLoading(true);

    try {
      const result = await invokeAgent(userText, {
        ...context,
        screen: context?.screen ?? 'ai_coach',
      });

      const proposal = result.actions?.find(a => a.type === 'propose_plan_change');
      if (proposal) {
        setPendingProposal(proposal.payload as PendingProposal);
      }

      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'model', text: result.response || "Sorry, I didn't catch that." },
      ]);
    } catch (e: any) {
      console.error('Chat error:', e);
      setMessages(prev => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'model', text: "I'm having trouble connecting right now. Try again in a moment." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPlanChange = async () => {
    if (!pendingProposal) return;
    setLoading(true);
    try {
      const result = await invokeAgent('confirm', {
        ...context,
        screen: context?.screen ?? 'ai_coach',
        action: 'confirm_plan_change',
        pendingPlan: pendingProposal.proposed_plan,
      });
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', text: result.response },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', text: "Couldn't save the plan. Try again." },
      ]);
    } finally {
      setPendingProposal(null);
      setLoading(false);
    }
  };

  const handleCancelPlanChange = () => {
    setPendingProposal(null);
    setMessages(prev => [
      ...prev,
      { id: Date.now().toString(), role: 'model', text: "No problem — your plan stays as is." },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons
              name={isModal ? 'chevron-down' : 'chevron-back'}
              size={24}
              color={CHARTREUSE}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Spark AI</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageBubble,
                item.role === 'user' ? styles.userBubble : styles.aiBubble,
              ]}
            >
              <Text style={item.role === 'user' ? styles.userText : styles.aiText}>
                {item.text}
              </Text>
            </View>
          )}
        />

        {/* Plan change proposal bar */}
        {pendingProposal && !loading && (
          <View style={styles.proposalBar}>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmPlanChange}>
              <Text style={styles.confirmButtonText}>Confirm Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelPlanChange}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input area */}
        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask about exercises, form, diet..."
            placeholderTextColor={GRAY}
            onSubmitEditing={handleSend}
            editable={!loading}
            multiline
          />
          {loading ? (
            <View style={styles.sendButtonLoading}>
              <ActivityIndicator size="small" color={CHARTREUSE} />
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim()}
            >
              <Ionicons name="send" size={18} color={BG} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WHITE,
  },

  // Chat
  chatList: {
    padding: 15,
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 18,
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: CHARTREUSE,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: CARD_BG,
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: BG,
    fontSize: 16,
    lineHeight: 22,
  },
  aiText: {
    color: WHITE,
    fontSize: 16,
    lineHeight: 22,
  },

  // Proposal bar
  proposalBar: {
    flexDirection: 'row',
    padding: 10,
    paddingHorizontal: 15,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: CARD_BG,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: CHARTREUSE,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: BG,
    fontWeight: '700',
    fontSize: 15,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: ROW_BG,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: GRAY,
    fontWeight: '600',
    fontSize: 15,
  },

  // Input
  inputArea: {
    flexDirection: 'row',
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    alignItems: 'center',
    backgroundColor: BG,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: ROW_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 10,
    fontSize: 16,
    color: WHITE,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CHARTREUSE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonLoading: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
