import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Message } from './ChatView';

// ── Theme ───────────────────────────────────────────────────────
const BG         = '#0D0D0D';
const CARD_BG    = '#1A1A1A';
const ROW_BG     = '#242424';
const CHARTREUSE = '#CFFF00';
const WHITE      = '#FFFFFF';
const GRAY       = '#888888';
const BORDER     = '#2A2A2A';
const NEON       = '#00F5FF';

// ── Types ───────────────────────────────────────────────────────
export type ChatSession = {
  id: string;
  preview: string;
  summary?: string;  // AI-generated title from Gemini
  date: string;
  agent: string;
  messages: Message[];
};

export type ChatHistoryRow = {
  id: string;
  role: 'user' | 'model';
  content: string;
  agent: string;
  created_at: string;
};

// ── Session grouping ────────────────────────────────────────────
export function groupIntoSessions(rows: ChatHistoryRow[], gapMinutes: number = 30): ChatSession[] {
  if (rows.length === 0) return [];

  const sessions: ChatSession[] = [];
  let current: ChatHistoryRow[] = [rows[0]];

  for (let i = 1; i < rows.length; i++) {
    const lastTime = new Date(current[current.length - 1].created_at).getTime();
    const thisTime = new Date(rows[i].created_at).getTime();

    if (thisTime - lastTime > gapMinutes * 60 * 1000) {
      sessions.push(buildSession(current));
      current = [rows[i]];
    } else {
      current.push(rows[i]);
    }
  }
  sessions.push(buildSession(current));
  return sessions;
}

function buildSession(rows: ChatHistoryRow[]): ChatSession {
  const firstUserMsg = rows.find(r => r.role === 'user');
  const firstModelMsg = rows.find(r => r.role === 'model');
  const preview = firstUserMsg?.content ?? firstModelMsg?.content ?? 'Chat session';

  return {
    id: rows[0].created_at,
    preview: preview.length > 80 ? preview.slice(0, 77) + '...' : preview,
    date: rows[0].created_at,
    agent: firstModelMsg?.agent ?? 'companion',
    messages: rows.map(r => ({
      id: r.id,
      role: r.role,
      text: r.content,
    })),
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getAgentLabel(agent: string): string {
  switch (agent) {
    case 'daily': return 'Workout';
    case 'plan': return 'Plan';
    case 'companion': return 'Coach';
    default: return 'Coach';
  }
}

// ── Component ───────────────────────────────────────────────────
type SessionListViewProps = {
  sessions: ChatSession[];
  loading: boolean;
  onSelectSession: (session: ChatSession) => void;
  onNewChat: () => void;
};

export const SessionListView = ({
  sessions, loading, onSelectSession, onNewChat,
}: SessionListViewProps) => {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Spark AI</Text>
      </View>

      {/* New Chat Button */}
      <TouchableOpacity style={styles.newChatButton} onPress={onNewChat} activeOpacity={0.8}>
        <Ionicons name="add" size={20} color={BG} />
        <Text style={styles.newChatText}>New Chat</Text>
      </TouchableOpacity>

      {/* Session List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CHARTREUSE} />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="chatbubbles-outline" size={48} color={GRAY} />
          <Text style={styles.emptyText}>No conversations yet.</Text>
          <Text style={styles.emptySubtext}>Start a new chat to get coaching!</Text>
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.sessionCard}
              onPress={() => onSelectSession(item)}
              activeOpacity={0.7}
            >
              <View style={styles.sessionContent}>
                <Text style={styles.sessionTitle} numberOfLines={1}>
                  {item.summary || item.preview}
                </Text>
                {item.summary ? (
                  <Text style={styles.sessionPreview} numberOfLines={1}>
                    {item.preview}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.sessionDate}>{formatDate(item.date)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: WHITE,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHARTREUSE,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginBottom: 16,
  },
  newChatText: {
    fontSize: 16,
    fontWeight: '700',
    color: BG,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: WHITE,
  },
  emptySubtext: {
    fontSize: 14,
    color: GRAY,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sessionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionContent: {
    flex: 1,
    marginRight: 12,
  },
  sessionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: WHITE,
    marginBottom: 2,
  },
  sessionPreview: {
    fontSize: 13,
    color: GRAY,
  },
  sessionDate: {
    fontSize: 13,
    color: GRAY,
    flexShrink: 0,
  },
});
