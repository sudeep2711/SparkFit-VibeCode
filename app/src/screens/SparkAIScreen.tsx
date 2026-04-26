import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  KeyboardAvoidingView, Platform, SafeAreaView,
  ActivityIndicator, TouchableOpacity, ScrollView,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase, invokeAgent } from '../services/supabase';

// ── Theme ─────────────────────────────────────────────────────────
const BG         = '#0D0D0D';
const CARD_BG    = '#1A1A1A';
const ROW_BG     = '#242424';
const CHARTREUSE = '#CFFF00';
const WHITE      = '#FFFFFF';
const GRAY       = '#888888';
const BORDER     = '#2A2A2A';
const ORANGE     = '#FF9500';

// ── Types ─────────────────────────────────────────────────────────
type Exercise = {
  name: string;
  type: string;
  sets?: number;
  reps?: number;
  coach_tip?: string;
  [key: string]: unknown;
};

type DailyPlan = {
  day: string;
  focus: string;
  is_rest_day?: boolean;
  estimated_total_time_mins?: number;
  exercises: Exercise[];
};

type ThreadMessage = {
  id: string;
  role: 'user' | 'model';
  text: string;
  created_at?: string;
};

type PendingProposal = {
  proposed_plan: unknown[];
  change_summary: string;
  plan_id: string;
} | null;

type DateSeparatorItem = { type: 'separator'; label: string; key: string };
type MessageListItem   = { type: 'message'; key: string } & ThreadMessage;
type ListItem          = DateSeparatorItem | MessageListItem;

type ChipConfig = { label: string; message: string };

// ── Helpers ───────────────────────────────────────────────────────
function getDateLabel(dateStr: string): string {
  const date    = new Date(dateStr);
  const now     = new Date();
  const today   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function buildListItems(messages: ThreadMessage[]): ListItem[] {
  const items: ListItem[] = [];
  let lastLabel = '';
  for (const msg of messages) {
    const label = msg.created_at ? getDateLabel(msg.created_at) : 'Today';
    if (label !== lastLabel) {
      items.push({ type: 'separator', label, key: `sep-${label}-${msg.id}` });
      lastLabel = label;
    }
    items.push({ type: 'message', key: msg.id, ...msg });
  }
  return items;
}

function minutesSinceLastMessage(messages: ThreadMessage[]): number {
  const last = messages[messages.length - 1];
  if (!last?.created_at) return 9999;
  return (Date.now() - new Date(last.created_at).getTime()) / 60000;
}

function buildChips(
  todayPlan: DailyPlan | null,
  currentStreak: number,
  isCompletedToday: boolean,
  isEmpty: boolean,
): ChipConfig[] {
  if (isEmpty) {
    return [
      { label: "What's my workout today?",  message: "What's my workout today?" },
      { label: "How do I get started?",      message: "How do I get started with my fitness journey?" },
      { label: "What should I eat today?",   message: "What should I eat to support my fitness goal?" },
      { label: "What can you help me with?", message: "What can you help me with as my AI coach?" },
    ];
  }

  const chips: ChipConfig[] = [];

  // Slot 1 — workout state
  if (todayPlan?.is_rest_day) {
    chips.push({ label: "Rest day tips", message: "What should I do on rest days to recover faster?" });
  } else if (isCompletedToday) {
    chips.push({ label: "I finished today's workout!", message: "I just finished today's workout. Any tips for recovery?" });
  } else {
    chips.push({ label: "What's my workout today?", message: "What's my workout today?" });
  }

  // Slot 2 — first exercise or nutrition fallback
  const firstEx = todayPlan?.exercises?.[0];
  if (firstEx && !todayPlan?.is_rest_day) {
    chips.push({ label: `How do I do ${firstEx.name}?`, message: `How do I properly do ${firstEx.name}? Any form tips?` });
  } else {
    chips.push({ label: "Nutrition tips for my goal", message: "What should I eat to support my fitness goal?" });
  }

  // Slot 3 — streak
  if (currentStreak >= 3) {
    chips.push({ label: `${currentStreak}-day streak 🔥`, message: `I'm on a ${currentStreak}-day streak. How do I keep the momentum going?` });
  } else if (currentStreak === 0) {
    chips.push({ label: "Help me get back on track", message: "I want to get back on track with my fitness. What should I focus on today?" });
  } else {
    chips.push({ label: "How's my streak going?", message: "How is my workout streak going and what do I need to maintain it?" });
  }

  // Slot 4 — always available
  chips.push({ label: "Swap an exercise", message: "I want to swap one of my exercises. Can you suggest an alternative?" });

  return chips.slice(0, 4);
}

// ── Sub-components ────────────────────────────────────────────────
const DateSeparatorRow = ({ label }: { label: string }) => (
  <View style={styles.separatorRow}>
    <View style={styles.separatorLine} />
    <Text style={styles.separatorLabel}>{label}</Text>
    <View style={styles.separatorLine} />
  </View>
);

const MessageBubble = ({ msg }: { msg: ThreadMessage }) => (
  <View style={[styles.bubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
    <Text style={msg.role === 'user' ? styles.userText : styles.aiText}>{msg.text}</Text>
  </View>
);

const EmptyCard = () => (
  <View style={styles.emptyCard}>
    <Ionicons name="flash" size={28} color={CHARTREUSE} style={{ marginBottom: 12 }} />
    <Text style={styles.emptyTitle}>Hey, I'm Spark.</Text>
    <Text style={styles.emptySubtitle}>Your AI fitness coach.{'\n'}Tap a suggestion or ask me anything.</Text>
  </View>
);

// ── Screen ────────────────────────────────────────────────────────
export const SparkAIScreen = () => {
  const [messages, setMessages]               = useState<ThreadMessage[]>([]);
  const [inputText, setInputText]             = useState('');
  const [loading, setLoading]                 = useState(false);
  const [fetching, setFetching]               = useState(true);
  const [isAtBottom, setIsAtBottom]           = useState(true);
  const [containerHeight, setContainerHeight] = useState(0);
  const [contentHeight, setContentHeight]     = useState(0);
  const [todayPlan, setTodayPlan]             = useState<DailyPlan | null>(null);
  const [currentStreak, setCurrentStreak]     = useState(0);
  const [isCompletedToday, setIsCompletedToday] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<PendingProposal>(null);
  const flatListRef = useRef<FlatList>(null);

  const fetchData = useCallback(async () => {
    try {
      setFetching(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: historyData }, { data: planData }] = await Promise.all([
        supabase
          .from('chat_history')
          .select('id, role, content, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(500),
        supabase
          .from('workout_plans')
          .select('id, plan_data')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      ]);

      if (historyData) {
        setMessages(historyData.map(row => ({
          id: row.id,
          role: row.role as 'user' | 'model',
          text: row.content,
          created_at: row.created_at,
        })));
      }

      if (planData?.plan_data) {
        const rawPlan = planData.plan_data;
        const weekPlan: DailyPlan[] = Array.isArray(rawPlan)
          ? rawPlan
          : Array.isArray(rawPlan?.week_plan) ? rawPlan.week_plan : [];

        if (weekPlan.length > 0) {
          const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
          const today = weekPlan.find(d => d.day.toLowerCase() === todayName.toLowerCase())
            ?? weekPlan.find(d => !d.is_rest_day)
            ?? weekPlan[0];
          setTodayPlan(today);

          const todayDate = new Date().toISOString().split('T')[0];
          const { data: logData } = await supabase
            .from('workout_logs')
            .select('id, logged_data')
            .eq('user_id', user.id)
            .eq('plan_id', planData.id)
            .eq('date', todayDate)
            .maybeSingle();
          setIsCompletedToday(!!logData && !logData.logged_data?.is_partial);
        }
      }

      supabase
        .from('streaks')
        .select('current_streak')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data: s }) => setCurrentStreak(s?.current_streak ?? 0));

    } catch (err) {
      console.error('SparkAI fetch error:', err);
    } finally {
      setFetching(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { fetchData(); }, [fetchData])
  );

  const handleSend = async (text?: string) => {
    const userText = (text ?? inputText).trim();
    if (!userText || loading) return;

    const userMsg: ThreadMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: userText,
      created_at: new Date().toISOString(),
    };
    setInputText('');
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await invokeAgent(userText, { screen: 'ai_coach' });
      const proposal = result.actions?.find((a: any) => a.type === 'propose_plan_change');
      if (proposal) setPendingProposal(proposal.payload as NonNullable<PendingProposal>);

      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'model',
        text: result.response || "Sorry, I didn't catch that.",
        created_at: new Date().toISOString(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'model',
        text: "I'm having trouble connecting right now. Try again in a moment.",
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'model',
        text: result.response,
        created_at: new Date().toISOString(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'model',
        text: "Couldn't save the plan. Try again.",
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setPendingProposal(null);
      setLoading(false);
    }
  };

  const handleCancelPlanChange = () => {
    setPendingProposal(null);
    setMessages(prev => [...prev, {
      id: `a-${Date.now()}`,
      role: 'model',
      text: "No problem — your plan stays as is.",
      created_at: new Date().toISOString(),
    }]);
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const dist = contentSize.height - contentOffset.y - layoutMeasurement.height;
    setIsAtBottom(dist < 40);
  };

  const isEmpty    = !fetching && messages.length === 0;
  const showChips  = !loading;
  const canScroll  = contentHeight > containerHeight + 40;
  const showFab    = canScroll && !isAtBottom;
  const chips      = buildChips(todayPlan, currentStreak, isCompletedToday, isEmpty);
  const listData   = buildListItems(messages);

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="flash" size={16} color={CHARTREUSE} />
          </View>
          <Text style={styles.headerTitle}>SPARK AI</Text>
        </View>
        {currentStreak > 0 && (
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={14} color={ORANGE} />
            <Text style={styles.streakText}>{currentStreak}</Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >

        {/* ── Message thread ── */}
        <View style={styles.flex}>
          {fetching ? (
            <View style={styles.centered}>
              <ActivityIndicator color={CHARTREUSE} />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={listData}
              keyExtractor={item => item.key}
              contentContainerStyle={[styles.chatList, isEmpty && styles.chatListCentered]}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onLayout={e => setContainerHeight(e.nativeEvent.layout.height)}
              onContentSizeChange={(_, h) => {
                setContentHeight(h);
                if (isAtBottom) flatListRef.current?.scrollToEnd({ animated: false });
              }}
              ListHeaderComponent={isEmpty ? <EmptyCard /> : null}
              renderItem={({ item }) =>
                item.type === 'separator'
                  ? <DateSeparatorRow label={item.label} />
                  : <MessageBubble msg={item as ThreadMessage} />
              }
            />
          )}

          {/* Jump-to-latest FAB */}
          {showFab && (
            <TouchableOpacity
              style={styles.fab}
              onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-down" size={20} color={BG} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Plan proposal bar ── */}
        {pendingProposal && !loading && (
          <View style={styles.proposalBar}>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmPlanChange}>
              <Text style={styles.confirmBtnText}>Confirm Changes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelPlanChange}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Contextual chips ── */}
        {showChips && (
          <View style={styles.chipsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsScroll}
            >
              {chips.map((chip, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.chip, i < chips.length - 1 && { marginRight: 8 }]}
                  onPress={() => handleSend(chip.message)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.chipText}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Input ── */}
        <View style={styles.inputArea}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask about exercises, form, diet..."
            placeholderTextColor={GRAY}
            onSubmitEditing={() => handleSend()}
            editable={!loading}
            multiline
          />
          {loading ? (
            <View style={styles.sendBtnLoading}>
              <ActivityIndicator size="small" color={CHARTREUSE} />
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
              onPress={() => handleSend()}
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
  safeArea: { flex: 1, backgroundColor: BG },
  flex:     { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center' },
  iconCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: ROW_BG,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: WHITE, letterSpacing: 1 },
  streakBadge: { flexDirection: 'row', alignItems: 'center' },
  streakText:  { fontSize: 15, fontWeight: '700', color: ORANGE, marginLeft: 4 },

  // Chat list
  chatList:        { padding: 16, paddingBottom: 8 },
  chatListCentered: { flexGrow: 1, justifyContent: 'center' },

  // Date separator
  separatorRow:  { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  separatorLine: { flex: 1, height: 1, backgroundColor: BORDER },
  separatorLabel: {
    fontSize: 11, color: '#555555',
    textTransform: 'uppercase', letterSpacing: 1,
    marginHorizontal: 10,
  },

  // Bubbles
  bubble:     { maxWidth: '85%', padding: 12, borderRadius: 18, marginBottom: 10 },
  userBubble: { alignSelf: 'flex-end',  backgroundColor: CHARTREUSE, borderBottomRightRadius: 4 },
  aiBubble:   { alignSelf: 'flex-start', backgroundColor: CARD_BG,    borderBottomLeftRadius: 4 },
  userText:   { color: BG,    fontSize: 16, lineHeight: 22 },
  aiText:     { color: WHITE, fontSize: 16, lineHeight: 22 },

  // Empty card
  emptyCard: {
    alignSelf: 'center', width: '88%',
    backgroundColor: CARD_BG,
    borderRadius: 16, padding: 28,
    alignItems: 'center', marginVertical: 32,
  },
  emptyTitle:    { fontSize: 20, fontWeight: '700', color: WHITE, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20 },

  // FAB
  fab: {
    position: 'absolute', bottom: 16, right: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: CHARTREUSE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: CHARTREUSE, shadowOpacity: 0.4,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },

  // Proposal bar
  proposalBar: {
    flexDirection: 'row', padding: 10, paddingHorizontal: 15,
    borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: CARD_BG,
  },
  confirmBtn:     { flex: 1, backgroundColor: CHARTREUSE, paddingVertical: 12, borderRadius: 14, alignItems: 'center', marginRight: 8 },
  confirmBtnText: { color: BG, fontWeight: '700', fontSize: 15 },
  cancelBtn:      { flex: 1, backgroundColor: ROW_BG, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  cancelBtnText:  { color: GRAY, fontWeight: '600', fontSize: 15 },

  // Chips
  chipsContainer: { borderTopWidth: 1, borderTopColor: BORDER },
  chipsScroll:    { paddingHorizontal: 16, paddingVertical: 10 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: CARD_BG, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  chipText: { fontSize: 13, color: WHITE, fontWeight: '500' },

  // Input
  inputArea: {
    flexDirection: 'row', padding: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    borderTopWidth: 1, borderTopColor: BORDER,
    alignItems: 'center', backgroundColor: BG,
  },
  input: {
    flex: 1, minHeight: 40, maxHeight: 100,
    backgroundColor: ROW_BG,
    borderWidth: 1, borderColor: BORDER, borderRadius: 20,
    paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10,
    marginRight: 10, fontSize: 16, color: WHITE,
  },
  sendBtn:        { width: 40, height: 40, borderRadius: 20, backgroundColor: CHARTREUSE, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled:{ opacity: 0.4 },
  sendBtnLoading: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
