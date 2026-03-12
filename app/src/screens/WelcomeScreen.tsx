import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Button, Alert } from 'react-native';
import { supabase } from '../services/supabase';

export const WelcomeScreen = ({ navigation }: any) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkOnboardingAndNavigate = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, goal')
        .eq('id', userId)
        .single();
      
      if (data && data.goal) {
        navigation?.replace('Main');
      } else {
        navigation?.replace('Onboarding');
      }
    } catch (err) {
      navigation?.replace('Onboarding');
    }
  };

  async function signInWithEmail() {
    setLoading(true);
    setErrorMsg(null);
    const { data: { user }, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      setErrorMsg(error.message);
    } else if (user) {
      await checkOnboardingAndNavigate(user.id);
    }
    setLoading(false);
  }

  async function signUpWithEmail() {
    setLoading(true);
    setErrorMsg(null);
    const {
      data: { session, user },
      error,
    } = await supabase.auth.signUp({
      email: email,
      password: password,
    });
    
    if (error) {
      setErrorMsg(error.message);
    } else if (!session) {
      setErrorMsg('Please check your inbox for verification!');
    } else if (user) {
      await checkOnboardingAndNavigate(user.id);
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SparkFit</Text>
      <Text style={styles.subtitle}>Your AI Fitness Coach</Text>

      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          onChangeText={(text) => setEmail(text)}
          value={email}
          placeholder="email@address.com"
          autoCapitalize={'none'}
        />
        <TextInput
          style={styles.input}
          onChangeText={(text) => setPassword(text)}
          value={password}
          secureTextEntry={true}
          placeholder="Password"
          autoCapitalize={'none'}
        />
      </View>

      <View style={styles.buttonContainer}>
        <Button title="Sign in" disabled={loading} onPress={() => signInWithEmail()} />
      </View>
      <View style={styles.buttonContainer}>
        <Button title="Sign up" disabled={loading} onPress={() => signUpWithEmail()} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  errorText: {
    color: 'red',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputContainer: {
    width: '100%',
    maxWidth: 400,
  },
  input: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 10,
  }
});
