import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const DailyLogScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log Workout</Text>
      {/* Exercise logging inputs here */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  }
});
