import React from 'react';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { ChatView } from '../components/ChatView';

type SparkAIChatRoute = RouteProp<RootStackParamList, 'SparkAIChat'>;

export const SparkAIChatModal = () => {
  const navigation = useNavigation();
  const route = useRoute<SparkAIChatRoute>();
  const context = route.params?.context;

  return (
    <ChatView
      context={context}
      onBack={() => navigation.goBack()}
      isModal={true}
    />
  );
};
