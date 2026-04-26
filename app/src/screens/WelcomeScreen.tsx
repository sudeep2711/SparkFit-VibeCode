import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';

type Mode = 'landing' | 'signin' | 'signup';

export const WelcomeScreen = ({ navigation }: any) => {
  const [mode, setMode] = useState<Mode>('landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkOnboardingAndNavigate = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, goal')
        .eq('id', userId)
        .single();
      navigation?.replace(data?.goal ? 'Main' : 'Onboarding');
    } catch {
      navigation?.replace('Onboarding');
    }
  };

  const signIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data: { user }, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErrorMsg(error.message);
    else if (user) await checkOnboardingAndNavigate(user.id);
    setLoading(false);
  };

  const signUp = async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data: { session, user }, error } = await supabase.auth.signUp({ email, password });
    if (error) setErrorMsg(error.message);
    else if (!session) setErrorMsg('Please check your inbox for email verification!');
    else if (user) await checkOnboardingAndNavigate(user.id);
    setLoading(false);
  };

  const switchMode = (next: Mode) => {
    setErrorMsg(null);
    setMode(next);
  };

  // ─── Landing screen ────────────────────────────────────────────────────────
  if (mode === 'landing') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.inner}>
          {/* Logo */}
          <View style={styles.logoRow}>
            <View style={styles.logoIcon}>
              <Ionicons name="flash" size={16} color="#fff" />
            </View>
            <Text style={styles.logoText}>SparkFit</Text>
          </View>

          {/* Hero */}
          <View style={styles.heroContent}>
            <View style={styles.avatarCircle}>
              <Ionicons name="hardware-chip-outline" size={30} color="#fff" />
            </View>

            <Text style={styles.headline}>Welcome to{'\n'}SparkFit</Text>

            <Text style={styles.subtitle}>
              "Hi! I'm Spark, your AI trainer. Ready to{' '}
              <Text style={styles.subtitleEmphasis}>build a better you</Text>?"
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonArea}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => switchMode('signup')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Let's Get Started</Text>
              <Ionicons name="arrow-forward" size={20} color="#000" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => switchMode('signin')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>I already have an account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Auth form (sign in / sign up) ────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.inner}>
          <TouchableOpacity style={styles.backButton} onPress={() => switchMode('landing')}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>

          <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.logoRow}>
              <View style={styles.logoIcon}>
                <Ionicons name="flash" size={16} color="#fff" />
              </View>
              <Text style={styles.logoText}>SparkFit</Text>
            </View>

            <Text style={styles.formTitle}>
              {mode === 'signin' ? 'Welcome back' : 'Create account'}
            </Text>
            <Text style={styles.formSubtitle}>
              {mode === 'signin'
                ? 'Sign in to continue your journey'
                : 'Start your fitness journey today'}
            </Text>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

            <TextInput
              style={styles.input}
              onChangeText={setEmail}
              value={email}
              placeholder="Email address"
              placeholderTextColor="#555"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              onChangeText={setPassword}
              value={password}
              placeholder="Password"
              placeholderTextColor="#555"
              secureTextEntry
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={mode === 'signin' ? signIn : signUp}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>
                    {mode === 'signin' ? 'Sign In' : 'Sign Up'}
                  </Text>
                  <Ionicons name="arrow-forward" size={20} color="#000" />
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchModeButton}
              onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              <Text style={styles.switchModeText}>
                {mode === 'signin'
                  ? "Don't have an account? Sign up"
                  : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
  },

  // ── Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    marginBottom: 8,
  },
  logoIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#5B6BFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },

  // ── Landing hero
  heroContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 20,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#00BFA5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  headline: {
    fontSize: 42,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 50,
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#777',
    lineHeight: 26,
  },
  subtitleEmphasis: {
    fontStyle: 'italic',
    fontWeight: '700',
    color: '#aaa',
  },

  // ── Buttons
  buttonArea: {
    paddingBottom: 36,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#CBFF5B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 30,
    gap: 8,
  },
  primaryButtonText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Auth form
  backButton: {
    paddingTop: 16,
    paddingBottom: 4,
    alignSelf: 'flex-start',
  },
  formContent: {
    flexGrow: 1,
    paddingTop: 16,
    paddingBottom: 40,
  },
  formTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginTop: 32,
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 16,
    color: '#777',
    marginBottom: 36,
  },
  errorText: {
    color: '#FF453A',
    marginBottom: 16,
    fontSize: 14,
  },
  input: {
    backgroundColor: '#1C1C1E',
    color: '#fff',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  switchModeButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  switchModeText: {
    color: '#666',
    fontSize: 15,
  },
});
