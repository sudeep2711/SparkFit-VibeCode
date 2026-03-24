import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// ── Design tokens ──────────────────────────────────────────────
const C = {
  bg: '#111111',
  cardActive: '#4A6FFF',
  iconActive: '#ffffff',
  iconInactive: '#4A4A4A',
  labelActive: '#ffffff',
  labelInactive: '#3E3E3E',
  border: 'rgba(255,255,255,0.06)',
};

type TabKey = 'Dashboard' | 'Progress' | 'AICoach' | 'Profile';

type TabConfig = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  rotate?: string;
  overlayIcon?: keyof typeof Ionicons.glyphMap;
};

const TAB_CONFIG: Record<TabKey, TabConfig> = {
  Dashboard: {
    label: 'WORKOUT',
    icon: 'barbell-outline',
    activeIcon: 'barbell',
    rotate: '-35deg',
  },
  Progress: {
    label: 'INSIGHTS',
    icon: 'pulse-outline',
    activeIcon: 'pulse',
    overlayIcon: 'sparkles',
  },
  AICoach: {
    label: 'SPARK AI',
    icon: 'flash-outline',
    activeIcon: 'flash',
  },
  Profile: {
    label: 'PROFILE',
    icon: 'person-outline',
    activeIcon: 'person',
  },
};

// ── Single tab item ─────────────────────────────────────────────
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

  // Spring bounce on every press
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Card background fades in/out (native driver → smooth 60fps)
  const cardOpacity = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(cardOpacity, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: true,
      tension: 180,
      friction: 14,
    }).start();
  }, [isFocused]);

  const handlePress = () => {
    // Compress then release
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 0.80,
        useNativeDriver: true,
        tension: 500,
        friction: 10,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 200,
        friction: 7,
      }),
    ]).start();
    onPress();
  };

  const iconColor = isFocused ? C.iconActive : C.iconInactive;
  const labelColor = isFocused ? C.labelActive : C.labelInactive;
  const iconName = isFocused ? config.activeIcon : config.icon;

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={onLongPress}
      style={styles.tabItem}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale: scaleAnim }] }]}>

        {/* Animated blue card (opacity-only, native driver) */}
        <Animated.View
          style={[styles.activeCard, { opacity: cardOpacity }]}
          pointerEvents="none"
        />

        {/* Icon + label */}
        <View style={styles.tabContent}>
          {/* Icon (with optional rotation and overlay sparkle for INSIGHTS) */}
          <View style={config.rotate ? { transform: [{ rotate: config.rotate }] } : undefined}>
            {config.overlayIcon ? (
              <View style={styles.compositeIcon}>
                <Ionicons name={iconName} size={20} color={iconColor} />
                <Ionicons
                  name={config.overlayIcon}
                  size={9}
                  color={iconColor}
                  style={styles.overlayIcon}
                />
              </View>
            ) : (
              <Ionicons name={iconName} size={22} color={iconColor} />
            )}
          </View>

          <Text style={[styles.label, { color: labelColor }]}>{config.label}</Text>
        </View>
      </Animated.View>
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

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <TabItem
              key={route.key}
              routeName={route.name}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 6,
    paddingHorizontal: 6,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Each tab takes equal width
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderRadius: 16,
    minHeight: 60,
  },

  // Blue pill — absolutely fills tabInner
  activeCard: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.cardActive,
    borderRadius: 16,
    marginHorizontal: 4,
  },

  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 4,
  },

  label: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
    textAlign: 'center',
  },

  // INSIGHTS: pulse line with sparkle overlay
  compositeIcon: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayIcon: {
    position: 'absolute',
    top: -3,
    right: -3,
  },
});
