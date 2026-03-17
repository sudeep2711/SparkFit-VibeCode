import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Button, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase, invokeAgent } from '../services/supabase';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

type PendingProposal = {
  proposed_plan: unknown[];
  change_summary: string;
  plan_id: string;
} | null;

export const AICoachScreen = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal>(null);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Show greeting — agent-companion fetches its own context on each message
    supabase.auth.getUser().then(({ data: { user } }) => {
      supabase.from('profiles').select('goal').eq('id', user?.id ?? '').single().then(({ data: profile }) => {
        setMessages([{
          id: Date.now().toString(),
          role: 'model',
          text: `Hey there! I'm your AI Coach. I see your goal is ${profile?.goal || 'fitness'}. How can I help you with your training today?`
        }]);
      }).catch(() => {
        setMessages([{ id: Date.now().toString(), role: 'model', text: "Hi! I'm your AI Coach. How can I help you today?" }]);
      }).finally(() => setInitializing(false));
    });
  }, []);

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const userText = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    setLoading(true);

    try {
      const result = await invokeAgent(userText, { screen: 'ai_coach' });
      // Check for plan proposal requiring user confirmation before DB write
      const proposal = result.actions?.find(a => a.type === 'propose_plan_change');
      if (proposal) {
        setPendingProposal(proposal.payload as PendingProposal);
      }
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', text: result.response || "Sorry, I didn't catch that." }
      ]);
    } catch (e: any) {
      console.error("Chat error:", e);
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', text: "I'm having trouble connecting right now. Try again in a moment." }
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
        screen: 'ai_coach',
        action: 'confirm_plan_change',
        pendingPlan: pendingProposal.proposed_plan,
      });
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', text: result.response }
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', text: "Couldn't save the plan. Try again." }
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
      { id: Date.now().toString(), role: 'model', text: "No problem — your plan stays as is." }
    ]);
  };

  if (initializing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>AI Coach 🏋️</Text>
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={styles.messageWrapper}>
              <View style={[
                styles.messageBubble, 
                item.role === 'user' ? styles.userBubble : styles.aiBubble
              ]}>
                <Text style={item.role === 'user' ? styles.userText : styles.aiText}>
                  {item.text}
                </Text>
              </View>
            </View>
          )}
        />

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

        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask about exercises, form, diet..."
            onSubmitEditing={handleSend}
            editable={!loading}
            multiline
          />
          {loading ? (
             <View style={styles.sendLoading}>
               <ActivityIndicator size="small" color="#007AFF" />
             </View>
          ) : (
            <Button title="Send" onPress={handleSend} disabled={!inputText.trim()} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  chatList: {
    padding: 15,
    paddingBottom: 20,
  },
  messageWrapper: {
    marginBottom: 15,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 12,
    borderRadius: 18,
    marginBottom: 5,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F2F2F7',
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
  },
  aiText: {
    color: '#000',
    fontSize: 16,
    lineHeight: 22,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 10,
    fontSize: 16,
  },
  sendLoading: {
    paddingHorizontal: 15,
  },
  proposalBar: {
    flexDirection: 'row',
    padding: 10,
    paddingHorizontal: 15,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#F8FFF8',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#34C759',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 15,
  },
});
