import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Button, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator } from 'react-native';
import { supabase } from '../services/supabase';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export const AICoachScreen = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  
  // To hold context for the AI
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userPlan, setUserPlan] = useState<any>(null);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    fetchContext();
  }, []);

  const fetchContext = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const { data: plan } = await supabase.from('workout_plans').select('plan_data').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single();

      setUserProfile(profile || {});
      setUserPlan(plan?.plan_data || {});

      setMessages([{
        id: Date.now().toString(),
        role: 'model',
        text: `Hey there! I'm your AI Coach. I see your goal is ${profile?.goal || 'fitness'}. How can I help you with your training today?`
      }]);

    } catch (e) {
      console.error(e);
      setMessages([{
        id: Date.now().toString(),
        role: 'model',
        text: "Hi! I'm your AI Coach. How can I help you today?"
      }]);
    } finally {
      setInitializing(false);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const userText = inputText.trim();
    setInputText('');

    const newMessages: Message[] = [
      ...messages,
      { id: Date.now().toString(), role: 'user', text: userText }
    ];
    
    setMessages(newMessages);
    setLoading(true);

    try {
      // Format history for Gemini (exclude IDs to keep payload clean, just roles and text)
      const history = newMessages.slice(0, -1).map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const res = await supabase.functions.invoke('chat-coach', {
        body: {
          profile: userProfile,
          plan: userPlan,
          history: history,
          userMessage: userText
        }
      });

      if (res.error) throw new Error(res.error.message || "Failed to reach coach");

      // res.data contains the string response if backend returns text/plain directly
      // otherwise fallback or parse
      const aiResponseText = typeof res.data === 'string' ? res.data : await res.data.text();

      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'model', text: aiResponseText || "Sorry, I didn't catch that." }
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
  }
});
