import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { invokeAgent } from '../services/supabase';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'ChangeWorkoutChat'>;
type RouteProps = RouteProp<RootStackParamList, 'ChangeWorkoutChat'>;

type Message = {
    id: string;
    role: 'user' | 'model';
    text: string;
};

// 4 explicit questions before AI gen
const QUESTIONS = [
    { key: 'goal', text: "Hey! What's your goal for today's new workout?", options: ["Cardio", "Strength", "Recovery"] },
    { key: 'time', text: "How much time do you have?", options: ["15 min", "30 min", "45+ min"] },
    { key: 'equipment', text: "What equipment is available?", options: ["Bodyweight", "Dumbbells", "Full Gym"] },
    { key: 'notes', text: "Any specific areas to focus on or injuries I should know about? (Type your answer below)", isText: true }
];

export const ChangeWorkoutChatScreen = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute<RouteProps>();
    const { planId } = route.params;

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(false);

    const [questionIndex, setQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});

    type PendingProposal = {
        proposed_plan: unknown[];
        change_summary: string;
        plan_id: string;
    } | null;
    const [pendingProposal, setPendingProposal] = useState<PendingProposal>(null);

    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        // Post the first question on mount
        const q1 = QUESTIONS[0];
        setMessages([{
            id: Date.now().toString(),
            role: 'model',
            text: q1.text
        }]);
    }, []);

    const handleOptionSelect = (option: string) => {
        handleUserResponse(option);
    };

    const handleTextSubmit = () => {
        if (!inputText.trim()) return;
        const text = inputText.trim();
        setInputText('');
        handleUserResponse(text);
    };

    const handleUserResponse = (answer: string) => {
        const currentQ = QUESTIONS[questionIndex];
        setAnswers(prev => ({ ...prev, [currentQ.key]: answer }));

        // Add user message
        setMessages(prev => [
            ...prev,
            { id: Date.now().toString(), role: 'user', text: answer }
        ]);

        const nextIndex = questionIndex + 1;
        if (nextIndex < QUESTIONS.length) {
            setTimeout(() => {
                setQuestionIndex(nextIndex);
                setMessages(prev => [
                    ...prev,
                    { id: Date.now().toString(), role: 'model', text: QUESTIONS[nextIndex].text }
                ]);
            }, 500);
        } else {
            setTimeout(() => {
                setMessages(prev => [
                    ...prev,
                    { id: Date.now().toString(), role: 'model', text: "Great! Generating your custom workout for today. Give me just a second..." }
                ]);
                triggerWorkoutGeneration({ ...answers, [currentQ.key]: answer });
            }, 500);
        }
    };

    const triggerWorkoutGeneration = async (finalAnswers: Record<string, string>) => {
        setLoading(true);
        try {
            const result = await invokeAgent('Change my workout for today', {
                screen: 'change_workout',
                planId,
                chatPreferences: finalAnswers as unknown as Record<string, unknown>,
            });

            const proposal = result.actions?.find(a => a.type === 'propose_plan_change');
            if (proposal) {
                setPendingProposal(proposal.payload as PendingProposal);
            }

            setMessages(prev => [
                ...prev,
                { id: Date.now().toString(), role: 'model', text: result.response || "All done! I've updated your workout for today. You can close this chat and start when ready!" }
            ]);
        } catch (error: any) {
            console.error(error);
            setMessages(prev => [
                ...prev,
                { id: Date.now().toString(), role: 'model', text: "Something went wrong generating that plan. Please try again later." }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmPlanChange = async () => {
        if (!pendingProposal) return;
        setLoading(true);
        try {
            const result = await invokeAgent('confirm', {
                screen: 'change_workout',
                action: 'confirm_plan_change',
                pendingPlan: pendingProposal.proposed_plan,
            });
            setMessages(prev => [
                ...prev,
                { id: Date.now().toString(), role: 'model', text: result.response }
            ]);
        } catch {
            setMessages(prev => [
                ...prev,
                { id: Date.now().toString(), role: 'model', text: "Couldn't save the plan. Try again." }
            ]);
        } finally {
            setPendingProposal(null);
            setLoading(false);
        }
    };

    const handleCancelPlanChange = () => {
        setPendingProposal(null);
        setMessages(prev => [
            ...prev,
            { id: Date.now().toString(), role: 'model', text: "Got it — no changes made." }
        ]);
    };

    const currentQuestion = questionIndex < QUESTIONS.length ? QUESTIONS[questionIndex] : null;

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Change Workout</Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ position: 'absolute', right: 20 }}>
                        <Text style={styles.closeText}>Close</Text>
                    </TouchableOpacity>
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
                        </View>
                    )}
                />

                {loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#007AFF" />
                        <Text style={styles.loadingText}>Building custom routine...</Text>
                    </View>
                )}

                {!loading && currentQuestion && (
                    <View style={styles.inputArea}>
                        {currentQuestion.isText ? (
                            <View style={styles.textInputRow}>
                                <TextInput
                                    style={styles.input}
                                    value={inputText}
                                    onChangeText={setInputText}
                                    placeholder="E.g., Protect my lower back..."
                                    onSubmitEditing={handleTextSubmit}
                                    keyboardType="default"
                                />
                                <TouchableOpacity style={styles.sendButton} onPress={handleTextSubmit}>
                                    <Text style={styles.sendButtonText}>Send</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.optionsGrid}>
                                {currentQuestion.options?.map((opt, i) => (
                                    <TouchableOpacity key={i} style={styles.optionPill} onPress={() => handleOptionSelect(opt)}>
                                        <Text style={styles.optionText}>{opt}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {!loading && !currentQuestion && (
                    <View style={styles.inputArea}>
                        {pendingProposal ? (
                            <View style={styles.proposalRow}>
                                <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmPlanChange}>
                                    <Text style={styles.confirmButtonText}>Confirm Changes</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelPlanChange}>
                                    <Text style={styles.cancelButtonText}>Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.doneButton} onPress={() => navigation.goBack()}>
                                <Text style={styles.doneButtonText}>Return to Dashboard</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#fff' },
    container: { flex: 1 },
    header: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row'
    },
    title: { fontSize: 18, fontWeight: '700' },
    closeText: { color: '#007AFF', fontWeight: '600', fontSize: 16 },
    chatList: { padding: 15, paddingBottom: 20 },
    messageWrapper: { marginBottom: 15 },
    messageBubble: {
        maxWidth: '85%',
        padding: 14,
        borderRadius: 18,
        marginBottom: 5,
    },
    userBubble: {
        alignSelf: 'flex-end',
        backgroundColor: '#007AFF',
        borderBottomRightRadius: 4,
    },
    aiBubble: {
        alignSelf: 'flex-start',
        backgroundColor: '#F2F2F7',
        borderBottomLeftRadius: 4,
    },
    userText: { color: '#fff', fontSize: 16, lineHeight: 22 },
    aiText: { color: '#000', fontSize: 16, lineHeight: 22 },

    inputArea: {
        padding: 15,
        paddingBottom: Platform.OS === 'ios' ? 30 : 15,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        backgroundColor: '#fff',
    },
    textInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        minHeight: 45,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 20,
        paddingHorizontal: 15,
        fontSize: 16,
        marginRight: 10,
        backgroundColor: '#F9F9F9'
    },
    sendButton: {
        backgroundColor: '#007AFF',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    sendButtonText: { color: '#fff', fontWeight: '700' },
    optionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'center'
    },
    optionPill: {
        backgroundColor: '#000',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 24,
    },
    optionText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    doneButton: {
        backgroundColor: '#34C759',
        paddingVertical: 16,
        borderRadius: 24,
        alignItems: 'center'
    },
    doneButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    loadingContainer: {
        padding: 30,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 14,
        color: '#666',
        fontWeight: '500'
    },
    proposalRow: {
        flexDirection: 'row',
        gap: 10,
    },
    confirmButton: {
        flex: 1,
        backgroundColor: '#34C759',
        paddingVertical: 14,
        borderRadius: 24,
        alignItems: 'center',
    },
    confirmButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    cancelButton: {
        flex: 1,
        backgroundColor: '#F2F2F7',
        paddingVertical: 14,
        borderRadius: 24,
        alignItems: 'center',
    },
    cancelButtonText: { color: '#333', fontWeight: '600', fontSize: 16 },
});
