import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { supabase } from '../services/supabase';
import { MainTabParamList } from '../types/navigation';

type ProfileNavProp = BottomTabNavigationProp<MainTabParamList, 'Profile'>;

type ProfileData = {
  displayName: string;
  initials: string;
  email: string;
  goal: string;
  fitnessLevel: string;
  equipment: string[];
  workoutDaysPerWeek: number;
  memberSince: string;
};

type StatsData = {
  totalWorkouts: number;
  currentStreak: number;
  longestStreak: number;
  thisMonthWorkouts: number;
  monthlyTarget: number;
};

// Design tokens (Kinetic Pulse)
const C = {
  bg: '#131313',
  surface: '#1c1b1b',
  surfaceRaised: '#242424',
  blue: '#2E7BFF',
  lime: '#eaffb9',
  teal: '#00C9B8',
  lavender: '#9B8DE8',
  text: '#e5e2e1',
  textMuted: 'rgba(229,226,225,0.5)',
  sectionLabel: 'rgba(229,226,225,0.35)',
  border: 'rgba(255,255,255,0.07)',
  danger: '#FF453A',
};

export const ProfileScreen = () => {
  const navigation = useNavigation<ProfileNavProp>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [profileRes, streakRes, logsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('streaks').select('current_streak, longest_streak').eq('user_id', user.id).maybeSingle(),
        supabase.from('workout_logs').select('id, logged_data, date').eq('user_id', user.id),
      ]);

      const rawEmail = user.email ?? '';
      const emailPrefix = rawEmail.split('@')[0];
      const displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      const initials = displayName.charAt(0).toUpperCase();

      const p = profileRes.data;
      const memberSince = p?.created_at
        ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : 'N/A';

      setProfile({
        displayName,
        initials,
        email: rawEmail,
        goal: p?.goal ?? 'Not set',
        fitnessLevel: p?.fitness_level ?? 'Member',
        equipment: Array.isArray(p?.equipment) ? p.equipment : [],
        workoutDaysPerWeek: p?.workout_days_per_week ?? 0,
        memberSince,
      });

      const allLogs = logsRes.data ?? [];
      const currentMonth = new Date().toISOString().slice(0, 7);
      const totalWorkouts = allLogs.filter((l: any) => !l.logged_data?.is_partial).length;
      const thisMonthWorkouts = allLogs.filter(
        (l: any) => !l.logged_data?.is_partial && typeof l.date === 'string' && l.date.startsWith(currentMonth)
      ).length;
      const workoutDays = p?.workout_days_per_week ?? 0;

      setStats({
        totalWorkouts,
        currentStreak: streakRes.data?.current_streak ?? 0,
        longestStreak: streakRes.data?.longest_streak ?? 0,
        thisMonthWorkouts,
        monthlyTarget: workoutDays * 4,
      });
    } catch (err) {
      console.error('ProfileScreen fetchAll error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.lime} />
      </View>
    );
  }

  const monthlyProgress = stats && stats.monthlyTarget > 0
    ? Math.min(stats.thisMonthWorkouts / stats.monthlyTarget, 1)
    : 0;

  const levelLabel = (profile?.fitnessLevel ?? 'Member').toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Identity ── */}
        <View style={styles.identityRow}>
          {/* Avatar with teal ring */}
          <View style={styles.avatarRing}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>{profile?.initials ?? '?'}</Text>
            </View>
            {/* ELITE badge overlaid at bottom of avatar */}
            <View style={styles.eliteBadge}>
              <Text style={styles.eliteBadgeText}>{levelLabel}</Text>
            </View>
          </View>

          {/* Name + meta */}
          <View style={styles.identityMeta}>
            <Text style={styles.displayName}>{profile?.displayName ?? '—'}</Text>
            <Text style={styles.memberLine}>
              {levelLabel.charAt(0) + levelLabel.slice(1).toLowerCase()} Member{'  ·  '}Since {profile?.memberSince}
            </Text>
          </View>

          {/* Edit button */}
          <View style={styles.editBtn}>
            <Ionicons name="pencil" size={16} color={C.text} />
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          {/* Total Workouts — lime accent */}
          <View style={styles.statCard}>
            {/* halftone dots (decorative) */}
            <DotGrid color={C.lime} />
            <Text style={styles.statLabel}>TOTAL{'\n'}WORKOUTS</Text>
            <Text style={[styles.statValue, { color: C.lime }]}>{stats?.totalWorkouts ?? 0}</Text>
          </View>

          {/* Streak — blue accent */}
          <View style={styles.statCard}>
            <DotGrid color={C.blue} />
            <Text style={styles.statLabel}>CURRENT{'\n'}STREAK</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
              <Text style={[styles.statValue, { color: C.blue }]}>{stats?.currentStreak ?? 0}</Text>
              <Text style={[styles.statUnit, { color: C.blue }]}>DAYS</Text>
            </View>
          </View>
        </View>

        {/* ── Your Goals ── */}
        <Text style={styles.sectionLabel}>YOUR GOALS</Text>

        {/* Goal 1: primary goal */}
        <View style={styles.goalCard}>
          <View style={[styles.goalIconRing, { borderColor: C.teal }]}>
            <View style={[styles.goalIconDot, { backgroundColor: C.teal }]} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={styles.goalTitleRow}>
              <Text style={styles.goalTitle} numberOfLines={1}>{profile?.goal ?? 'Goal not set'}</Text>
              <Text style={[styles.goalValue, { color: C.teal }]}>Active</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { backgroundColor: C.teal, width: '100%' }]} />
            </View>
          </View>
        </View>

        {/* Goal 2: monthly workouts */}
        <View style={styles.goalCard}>
          <View style={[styles.goalIconRing, { borderColor: C.lavender }]}>
            <View style={[styles.goalIconDot, { backgroundColor: C.lavender, opacity: 0.6 }]} />
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={styles.goalTitleRow}>
              <Text style={styles.goalTitle}>{stats?.monthlyTarget ?? 0} Workouts this Month</Text>
              <Text style={[styles.goalValue, { color: C.lavender }]}>
                {stats?.thisMonthWorkouts ?? 0} / {stats?.monthlyTarget ?? 0}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, {
                backgroundColor: C.lavender,
                width: `${Math.round(monthlyProgress * 100)}%` as any,
              }]} />
            </View>
          </View>
        </View>

        {/* ── Performance & Engine ── */}
        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>PERFORMANCE & ENGINE</Text>
        <View style={styles.menuSection}>
          <MenuRow
            iconBg={C.teal}
            iconName="flash"
            label="AI Coach Settings"
            subtitle="Personalized training logic"
            onPress={() => navigation.navigate('AICoach')}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            iconBg="#3A3A5C"
            iconName="time"
            label="Workout History"
            subtitle="Your past sessions"
            onPress={() => navigation.navigate('Progress')}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            iconBg="#2A3A2A"
            iconName="barbell"
            label="Equipment"
            subtitle={profile?.equipment.length ? profile.equipment.join(', ') : 'Not configured'}
          />
          <View style={styles.menuDivider} />
          <MenuRow
            iconBg="#3A2A1A"
            iconName="trophy"
            label="Personal Records"
            subtitle="Coming soon"
          />
        </View>

        {/* ── Support & System ── */}
        <Text style={styles.sectionLabel}>SUPPORT & SYSTEM</Text>
        <View style={styles.menuSection}>
          <MenuRow
            iconBg="#1A2A3A"
            iconName="help-circle"
            label="Help Center"
            subtitle="Get support"
          />
          <View style={styles.menuDivider} />
          <MenuRow
            iconBg="#2A1A3A"
            iconName="shield-checkmark"
            label="Privacy Policy"
            subtitle="How we use your data"
          />
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuRow} onPress={handleLogout}>
            <View style={[styles.menuIconBox, { backgroundColor: '#3A1A1A' }]}>
              <Ionicons name="log-out-outline" size={18} color={C.danger} />
            </View>
            <View style={styles.menuTextBlock}>
              <Text style={[styles.menuLabel, { color: C.danger }]}>Logout</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>SPARKFIT V1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Dot grid decoration for stat cards ──
const DotGrid = ({ color }: { color: string }) => {
  const dots = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      dots.push(
        <View
          key={`${r}-${c}`}
          style={{
            width: 3,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: color,
            opacity: 0.12,
            margin: 3,
          }}
        />
      );
    }
  }
  return (
    <View style={styles.dotGrid}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 72 }}>
        {dots}
      </View>
    </View>
  );
};

// ── Reusable menu row ──
const MenuRow = ({
  iconBg, iconName, label, subtitle, onPress,
}: {
  iconBg: string;
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
}) => (
  <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
    <View style={[styles.menuIconBox, { backgroundColor: iconBg }]}>
      <Ionicons name={iconName} size={18} color="#fff" />
    </View>
    <View style={styles.menuTextBlock}>
      <Text style={styles.menuLabel}>{label}</Text>
      {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
    </View>
    {onPress ? <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.25)" /> : null}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  centered: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 48,
  },

  // ── Identity ──
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2.5,
    borderColor: C.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    position: 'relative',
  },
  avatarCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#1E3A3A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 30,
    fontWeight: '800',
    color: C.teal,
  },
  eliteBadge: {
    position: 'absolute',
    bottom: -1,
    alignSelf: 'center',
    backgroundColor: C.lime,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  eliteBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#131313',
    letterSpacing: 1,
  },
  identityMeta: {
    flex: 1,
  },
  displayName: {
    fontSize: 26,
    fontWeight: '800',
    color: C.text,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  memberLine: {
    fontSize: 13,
    color: C.textMuted,
    fontWeight: '500',
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },

  // ── Stats ──
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    minHeight: 130,
    justifyContent: 'flex-end',
  },
  dotGrid: {
    position: 'absolute',
    top: 10,
    right: 10,
    opacity: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.sectionLabel,
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 44,
    fontWeight: '900',
    lineHeight: 48,
    letterSpacing: -1,
  },
  statUnit: {
    fontSize: 14,
    fontWeight: '700',
    paddingBottom: 8,
  },

  // ── Section labels ──
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.sectionLabel,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // ── Goal cards ──
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 10,
  },
  goalIconRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  goalIconDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  goalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
    flex: 1,
    marginRight: 8,
  },
  goalValue: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 0,
  },
  progressTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  // ── Menu ──
  menuSection: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 24,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuTextBlock: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text,
  },
  menuSubtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 70,
  },

  // ── Footer ──
  footer: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.12)',
    letterSpacing: 3,
    marginTop: 8,
  },
});
