import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Button, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { invokeAgent } from '../services/supabase';
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

  const [messages, setMessages] = useState<Message[]>([{
    id: Date.now().toString(),
    role: 'model',
    text: `Hey! I see you're working on ${exerciseName} (Set ${currentSet} of ${targetSets}). What's up?`
  }]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const userText = inputText.trim();
    setInputText('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: userText }]);
    setLoading(true);

    try {
      const result = await invokeAgent(userText, {
        screen: 'mid_workout',
        workoutContext: {
          exerciseName,
          currentSet,
          targetSets,
          coachTip: coachTip || '',
        },
      });

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
