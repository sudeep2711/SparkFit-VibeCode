import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, Button, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase, invokeAgent } from '../services/supabase';

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  options?: string[];
};

type StepName = 'goal' | 'fitness_level' | 'workout_days_per_week' | 'training_location' | 'equipment' | 'confirmation' | 'generating';

type ProfileData = {
  goal: string;
  fitness_level: string;
  workout_days_per_week: number;
  training_location: string;
  equipment: string;
};

export const AIOnboardingChatScreen = ({ navigation }: any) => {
  const [messages, setMessages] = useState<Message[]>([
    { 
      id: Date.now().toString(), 
      role: 'model', 
      text: "Hi! I'm your AI Coach. What is your main fitness goal?",
      options: ["Build Muscle", "Lose Weight", "Get Stronger", "General Fitness"]
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepName>('goal');
  const [profile, setProfile] = useState<Partial<ProfileData>>({});
  
  const flatListRef = useRef<FlatList>(null);

  const parseDays = (input: string) => {
    const match = input.match(/\d+/);
    return match ? parseInt(match[0], 10) : 3; // default to 3 if not found
  }

  const handleAnswer = async (answerText: string) => {
    if (!answerText.trim() || loading) return;

    // 1. Add user message
    const answer = answerText.trim();
    setMessages(prev => {
      // remove options from previous model message so they disappear after answered
      const cleaned = prev.map(m => m.role === 'model' ? { ...m, options: undefined } : m);
      return [...cleaned, { id: Date.now().toString(), role: 'user', text: answer }];
    });
    setInputText('');

    // 2. Process answer and determine next step
    let nextProfile = { ...profile };
    let nextStep: StepName = currentStep;
    let nextQuestionText = "";
    let nextOptions: string[] | undefined = undefined;

    if (currentStep === 'goal') {
      nextProfile.goal = answer;
      nextStep = 'fitness_level';
      nextQuestionText = "How experienced are you with workouts?";
      nextOptions = ["Beginner", "Intermediate", "Advanced"];
    } 
    else if (currentStep === 'fitness_level') {
      nextProfile.fitness_level = answer;
      nextStep = 'workout_days_per_week';
      nextQuestionText = "How many days per week can you train?";
      nextOptions = ["2 days", "3 days", "4 days", "5 days", "6 days"];
    }
    else if (currentStep === 'workout_days_per_week') {
      nextProfile.workout_days_per_week = parseDays(answer);
      nextStep = 'training_location';
      nextQuestionText = "Where do you usually train?";
      nextOptions = ["Gym", "Home", "Outdoors"];
    }
    else if (currentStep === 'training_location') {
      nextProfile.training_location = answer;
      if (answer.toLowerCase().includes('home')) {
        nextStep = 'equipment';
        nextQuestionText = "What equipment do you have available?";
        nextOptions = ["Dumbbells", "Resistance Bands", "Pull-up Bar", "No Equipment"];
      } else {
        nextProfile.equipment = answer.toLowerCase().includes('gym') ? 'Gym Equipment' : 'None';
        nextStep = 'confirmation';
      }
    }
    else if (currentStep === 'equipment') {
      nextProfile.equipment = answer;
      nextStep = 'confirmation';
    }
    else if (currentStep === 'confirmation') {
      if (answer.toLowerCase().includes('no') || answer.toLowerCase().includes('start over')) {
        // Reset
        setProfile({});
        setCurrentStep('goal');
        setTimeout(() => {
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'model',
            text: "No problem! Let's start over. What is your main fitness goal?",
            options: ["Build Muscle", "Lose Weight", "Get Stronger", "General Fitness"]
          }]);
        }, 500);
        return;
      } else {
        // Generate plan!
        nextStep = 'generating';
      }
    }

    setProfile(nextProfile);
    setCurrentStep(nextStep);

    // 3. Add AI response
    if (nextStep === 'confirmation') {
      nextQuestionText = `Here's what I understood about your training plan:\n\n• Goal: ${nextProfile.goal}\n• Level: ${nextProfile.fitness_level}\n• Days: ${nextProfile.workout_days_per_week}\n• Location: ${nextProfile.training_location}\n• Equipment: ${nextProfile.equipment}\n\nLooks good?`;
      nextOptions = ["Yes, generate my plan!", "No, let's start over"];
      
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          text: nextQuestionText,
          options: nextOptions
        }]);
      }, 500);
    } else if (nextStep === 'generating') {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'model',
        text: "Awesome, I'm generating your personalized workout plan right now! Hang tight..."
      }]);
      await generatePlan(nextProfile as ProfileData);
    } else {
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'model',
          text: nextQuestionText,
          options: nextOptions
        }]);
      }, 600); // slight delay for chat feel
    }
  };

  const generatePlan = async (finalProfile: ProfileData) => {
    setLoading(true);
    try {
      await invokeAgent('Generate my workout plan', {
        screen: 'onboarding',
        profileData: finalProfile as unknown as Record<string, unknown>,
      });

      // Navigate to dashboard — agent-onboarding handles profile save + plan generation internally
      navigation.replace('Main');
    } catch (e: any) {
      console.error(e);
      setMessages(prev => [...prev, { id: 'err', role: 'model', text: "I tried to build your plan, but something went wrong. Let's try again!" }]);
      setCurrentStep('confirmation'); // Let them retry
      setLoading(false);
    }
  };

  const renderOptions = (options: string[]) => {
    return (
      <View style={styles.optionsContainer}>
        {options.map((opt, idx) => (
          <TouchableOpacity 
            key={idx} 
            style={styles.optionButton}
            onPress={() => handleAnswer(opt)}
            disabled={loading}
          >
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>SparkFit Coach ⚡️</Text>
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
              {item.options && renderOptions(item.options)}
            </View>
          )}
        />

        {currentStep === 'generating' ? (
           <View style={styles.loadingArea}>
             <ActivityIndicator size="large" color="#007AFF" />
             <Text style={styles.loadingText}>Building your plan...</Text>
           </View>
        ) : (
          <View style={styles.inputArea}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type your answer..."
              onSubmitEditing={() => handleAnswer(inputText)}
              editable={!loading}
            />
            <Button title="Send" onPress={() => handleAnswer(inputText)} disabled={loading || !inputText.trim()} />
          </View>
        )}
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
    paddingBottom: 40,
  },
  messageWrapper: {
    marginBottom: 15,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 15,
    marginBottom: 5,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 5,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
    borderBottomLeftRadius: 5,
  },
  userText: {
    color: '#fff',
    fontSize: 16,
  },
  aiText: {
    color: '#000',
    fontSize: 16,
    lineHeight: 22,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
    justifyContent: 'flex-start',
  },
  optionButton: {
    backgroundColor: '#fff',
    borderColor: '#007AFF',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginRight: 8,
    marginBottom: 8,
  },
  optionText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '500',
  },
  inputArea: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 10,
  },
  loadingArea: {
    padding: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  }
});
