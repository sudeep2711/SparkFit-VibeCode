import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Button, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
};

export const MidWorkoutChatScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  
  const { exerciseName, currentSet, targetSets, coachTip } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  
  const [userProfile, setUserProfile] = useState<any>(null);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    fetchContext();
  }, []);

  const fetchContext = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setUserProfile(profile || {});

      setMessages([{
        id: Date.now().toString(),
        role: 'model',
        text: `Hey! I see you're working on ${exerciseName} (Set ${currentSet} of ${targetSets}). What's up?`
      }]);

    } catch (e) {
      console.error(e);
      setMessages([{
        id: Date.now().toString(),
        role: 'model',
        text: "Hi! I'm your AI Coach. How can I help you mid-workout?"
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
      // Create a hidden context system message to inject into the history so the AI knows what's happening
      const workoutContextText = `[MID-WORKOUT CONTEXT: The user is currently executing ${exerciseName}. They are on set ${currentSet} of ${targetSets}. Associated coach tip for this exercise is: "${coachTip || 'None'}". Answer their question specifically with this context in mind.]`;
      
      const history = newMessages.slice(0, -1).map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));
      
      // Prepend context to the user's latest message if it's the first real question to the coach
      const userMessageWithContext = (messages.length <= 1) ? `${workoutContextText}\nUser says: ${userText}` : userText;

      const res = await supabase.functions.invoke('chat-coach', {
        body: {
          profile: userProfile,
          plan: { current_exercise: exerciseName }, // Mock minimal plan to avoid massive payloads mid-workout
          history: history,
          userMessage: userMessageWithContext
        }
      });

      if (res.error) throw new Error(res.error.message || "Failed to reach coach");

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
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                <Ionicons name="chevron-down" size={28} color="#007AFF" />
                <Text style={styles.backText}>Back to Workout</Text>
            </TouchableOpacity>
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
            placeholder="Ask your coach..."
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
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9'
  },
  backButton: {
      flexDirection: 'row',
      alignItems: 'center'
  },
  backText: {
      color: '#007AFF',
      fontSize: 18,
      fontWeight: '600',
      marginLeft: 4
  },
  chatList: { padding: 15, paddingBottom: 20 },
  messageWrapper: { marginBottom: 15 },
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
  userText: { color: '#fff', fontSize: 16, lineHeight: 22 },
  aiText: { color: '#000', fontSize: 16, lineHeight: 22 },
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
  sendLoading: { paddingHorizontal: 15 }
});
