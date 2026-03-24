import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const NEON = '#00F5FF';
const GRAY = '#404040';
const BG   = '#111111';

type TabKey = 'Dashboard' | 'Progress' | 'AICoach' | 'Profile';

type TabConfig = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;        // inactive (outline)
  activeIcon: keyof typeof Ionicons.glyphMap;  // active (filled)
  rotate?: string;
  overlayIcon?: keyof typeof Ionicons.glyphMap;
};

const TAB_CONFIG: Record<TabKey, TabConfig> = {
  Dashboard: { label: 'WORKOUT',  icon: 'barbell-outline',  activeIcon: 'barbell', rotate: '-35deg' },
  Progress:  { label: 'INSIGHTS', icon: 'pulse-outline',    activeIcon: 'pulse',   overlayIcon: 'sparkles' },
  AICoach:   { label: 'SPARK AI', icon: 'flash-outline',    activeIcon: 'flash' },
  Profile:   { label: 'PROFILE',  icon: 'person-outline',   activeIcon: 'person' },
};

// Renders an icon, handling rotation and INSIGHTS composite
const Icon = ({
  name,
  color,
  rotate,
  overlayIcon,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  rotate?: string;
  overlayIcon?: keyof typeof Ionicons.glyphMap;
}) => (
  <View style={rotate ? { transform: [{ rotate }] } : undefined}>
    {overlayIcon ? (
      <View style={styles.compositeWrapper}>
        <Ionicons name={name} size={20} color={color} />
        <Ionicons name={overlayIcon} size={9} color={color} style={styles.sparkleOverlay} />
      </View>
    ) : (
      <Ionicons name={name} size={22} color={color} />
    )}
  </View>
);

// ── Tab item ────────────────────────────────────────────────────
const TabItem = ({
  routeName,
  isFocused,
  onPress,
  onLongPress,
}: {
  routeName: string;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) => {
  const config = TAB_CONFIG[routeName as TabKey];
  if (!config) return null;

  // Single animated value drives everything
  const glow = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  // Gray icon fades out as neon fades in (perfect cross-fade, no outline)
  const grayOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  // Blob behind icon: stays subtle even at peak
  const blobOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] });

  useEffect(() => {
    Animated.timing(glow, {
      toValue: isFocused ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [isFocused]);

  const handlePress = () => {
    const target = isFocused ? 1 : 0;
    // Snap to full glow, then ease back to resting state
    Animated.sequence([
      Animated.timing(glow, { toValue: 1,      duration: 60,  useNativeDriver: true }),
      Animated.timing(glow, { toValue: target,  duration: 280, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={onLongPress}
      style={styles.tabItem}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
    >
      <View style={styles.tabContent}>

        <View style={styles.iconWrapper}>
          {/* Soft cyan blob — creates diffuse glow, no hard edge */}
          <Animated.View style={[styles.glowBlob, { opacity: blobOpacity }]} pointerEvents="none" />

          {/* Gray outline icon (fades out) */}
          <Animated.View style={[styles.iconLayer, { opacity: grayOpacity }]} pointerEvents="none">
            <Icon name={config.icon} color={GRAY} rotate={config.rotate} overlayIcon={config.overlayIcon} />
          </Animated.View>

          {/* Neon solid icon (fades in) */}
          <Animated.View style={[styles.iconLayer, { opacity: glow }]} pointerEvents="none">
            <Icon name={config.activeIcon} color={NEON} rotate={config.rotate} overlayIcon={config.overlayIcon} />
          </Animated.View>
        </View>

        <Text style={[styles.label, { color: isFocused ? '#ffffff' : '#383838' }]}>
          {config.label}
        </Text>

      </View>
    </TouchableOpacity>
  );
};

// ── Tab bar ─────────────────────────────────────────────────────
export const CustomTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TabItem
              key={route.key}
              routeName={route.name}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  bar: {
    flexDirection: 'row',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabContent: {
    alignItems: 'center',
    paddingVertical: 8,
    gap: 5,
  },

  // Fixed-size container so all three absolute layers stack correctly
  iconWrapper: {
    width: 48,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Diffuse glow blob: larger than icon, rounded, low opacity
  glowBlob: {
    position: 'absolute',
    width: 52,
    height: 40,
    borderRadius: 20,
    backgroundColor: NEON,
  },

  // Each icon layer sits centered on top of the blob
  iconLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // INSIGHTS composite (pulse + sparkle)
  compositeWrapper: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
  },

  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
    textAlign: 'center',
  },
});
