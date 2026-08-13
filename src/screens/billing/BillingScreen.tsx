import React from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import axios from 'axios';
import RazorpayCheckout, { RazorpayPaymentError } from 'react-native-razorpay';
import api from '../../services/api';
import { CheckSquare } from '../../components/icons';
import { font } from '../../theme/typography';

type AppStackParamList = {
  Home: undefined;
  Chat: undefined;
  Billing: undefined;
};

type Props = {
  navigation: NativeStackNavigationProp<AppStackParamList, 'Billing'>;
};

type BillingPlan = {
  id: string;
  name: string;
  amount: number;
  price: number;
  currency: string;
  billingCycle: 'yearly' | 'lifetime' | 'test';
  description: string;
};

type ActiveSubscription = {
  planId: string;
  planName: string;
  status: 'active';
  billingCycle: 'yearly' | 'lifetime' | 'test';
  expiresAt: number | null;
};

type BillingOptionsResponse = {
  plans: BillingPlan[];
  activeSubscription: ActiveSubscription | null;
  testMode: boolean;
};

type CreateOrderResponse = {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  plan: BillingPlan;
  prefill: {
    name: string;
    email: string;
  };
};

type VerifyPaymentResponse = {
  subscription: ActiveSubscription;
};

const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ detail?: string }>(error)) {
    return error.response?.data?.detail || 'Unable to complete the billing request.';
  }

  if (typeof error === 'object' && error !== null && 'description' in error) {
    const paymentError = error as RazorpayPaymentError;
    if (paymentError.description) {
      return paymentError.description;
    }
  }

  return error instanceof Error ? error.message : 'Payment could not be completed.';
};

const formatExpiry = (expiresAt: number | null) => {
  if (!expiresAt) {
    return 'Lifetime access';
  }

  return `Valid until ${new Date(expiresAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
};

const BillingScreen: React.FC<Props> = () => {
  const [plans, setPlans] = React.useState<BillingPlan[]>([]);
  const [activeSubscription, setActiveSubscription] = React.useState<ActiveSubscription | null>(null);
  const [isTestMode, setIsTestMode] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [processingPlanId, setProcessingPlanId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let isMounted = true;

    const loadBillingOptions = async () => {
      try {
        const response = await api.get<BillingOptionsResponse>('/billing/options');
        if (!isMounted) {
          return;
        }
        setPlans(response.data.plans);
        setActiveSubscription(response.data.activeSubscription);
        setIsTestMode(response.data.testMode);
      } catch (error) {
        if (isMounted) {
          Alert.alert('Billing unavailable', getErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadBillingOptions();
    return () => {
      isMounted = false;
    };
  }, []);

  const handlePurchase = React.useCallback(async (plan: BillingPlan) => {
    if (processingPlanId) {
      return;
    }

    setProcessingPlanId(plan.id);
    try {
      const orderResponse = await api.post<CreateOrderResponse>('/billing/orders', {
        plan_id: plan.id,
      });
      const order = orderResponse.data;
      const payment = await RazorpayCheckout.open({
        amount: order.amount,
        currency: order.currency,
        description: order.plan.description,
        key: order.keyId,
        name: 'NOVA',
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: '#F5F5F5' },
      });
      const verificationResponse = await api.post<VerifyPaymentResponse>('/billing/verify', payment);
      setActiveSubscription(verificationResponse.data.subscription);
      Alert.alert('Plan activated', `${order.plan.name} is now active on your account.`);
    } catch (error) {
      Alert.alert('Payment not completed', getErrorMessage(error));
    } finally {
      setProcessingPlanId(null);
    }
  }, [processingPlanId]);

  return (
    <View style={styles.container}>
      <LinearGradient pointerEvents="none" colors={['rgba(52,199,122,0.14)', 'rgba(2,10,8,0)']} style={styles.topGlow} />
      <Svg pointerEvents="none" width="100%" height="100%" viewBox="0 0 420 840" style={StyleSheet.absoluteFill}>
        <Path d="M-130 620 Q80 430 270 570 T580 470" stroke="#34C77A" strokeOpacity={0.08} strokeWidth={48} fill="none" />
        <Path d="M80 880 Q250 610 490 500" stroke="#34C77A" strokeOpacity={0.16} strokeWidth={1} fill="none" />
      </Svg>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>NOVA MEMBERSHIP</Text>
        <Text style={styles.title}>Choose your plan</Text>
        <Text style={styles.subtitle}>
          Unlock your NOVA plan with a secure Razorpay checkout.
        </Text>

        {isTestMode && (
          <View style={styles.testModeBanner}>
            <View style={styles.testDot} />
            <Text style={styles.testModeText}>Test mode — no real money is charged</Text>
          </View>
        )}

        {activeSubscription && (
          <LinearGradient colors={['#A7F3D0', '#52D99A']} style={styles.activePlanCard}>
            <CheckSquare size={22} color="#062016" weight="fill" />
            <View style={styles.activePlanCopy}>
              <Text style={styles.activePlanTitle}>{activeSubscription.planName} active</Text>
              <Text style={styles.activePlanText}>{formatExpiry(activeSubscription.expiresAt)}</Text>
            </View>
          </LinearGradient>
        )}

        <View style={styles.planList}>
          {isLoading && <ActivityIndicator size="large" color="#34C77A" />}
          {plans.map(plan => {
            const isActive = activeSubscription?.planId === plan.id;
            const isProcessing = processingPlanId === plan.id;
            return (
              <LinearGradient
                key={plan.id}
                colors={isActive ? ['rgba(24,92,61,0.97)', 'rgba(9,38,27,0.99)'] : ['rgba(17,37,28,0.97)', 'rgba(6,20,15,0.99)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.planCard, isActive && styles.planCardActive]}
              >
                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planCycle}>
                      {plan.billingCycle === 'lifetime'
                        ? 'One-time'
                        : plan.billingCycle === 'test'
                          ? '30-minute test access'
                          : 'Yearly'}
                    </Text>
                  </View>
                  <Text style={styles.planPrice}>₹{plan.price.toLocaleString('en-IN')}</Text>
                </View>
                <Text style={styles.planDescription}>{plan.description}</Text>
                <TouchableOpacity
                  style={[styles.planButton, isActive && styles.planButtonActive]}
                  activeOpacity={0.85}
                  disabled={isLoading || Boolean(processingPlanId) || isActive}
                  onPress={() => handlePurchase(plan)}
                >
                  {isProcessing ? <ActivityIndicator color="#062016" /> : (
                    <Text style={[styles.planButtonText, isActive && styles.planButtonTextActive]}>
                      {isActive ? 'Current plan' : `Choose ${plan.name}`}
                    </Text>
                  )}
                </TouchableOpacity>
              </LinearGradient>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020A08',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 34,
    paddingBottom: 56,
  },
  eyebrow: {
    ...font.bold,
    color: '#65B893',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  title: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 36,
    lineHeight: 42,
    marginTop: 8,
  },
  subtitle: {
    ...font.regular,
    color: '#91A89D',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  testModeBanner: {
    marginTop: 22,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: 'rgba(13,45,33,0.78)',
    borderWidth: 0,
    borderColor: 'rgba(52,199,122,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  testDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34C77A',
    marginRight: 9,
  },
  testModeText: {
    ...font.bold,
    color: '#DDF8E9',
    fontSize: 13,
  },
  activePlanCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activePlanCopy: {
    marginLeft: 11,
  },
  activePlanTitle: {
    ...font.black,
    color: '#062016',
    fontSize: 15,
  },
  activePlanText: {
    ...font.regular,
    color: '#315B48',
    fontSize: 12,
    marginTop: 2,
  },
  planList: {
    marginTop: 24,
  },
  planCard: {
    padding: 20,
    borderRadius: 26,
    borderWidth: 0,
    borderColor: 'rgba(92,218,153,0.18)',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  planCardActive: {
    borderColor: '#34C77A',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planName: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 20,
  },
  planCycle: {
    ...font.medium,
    color: '#83A494',
    fontSize: 13,
    marginTop: 2,
  },
  planPrice: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 22,
  },
  planDescription: {
    ...font.regular,
    color: '#A7B9B0',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 18,
  },
  planButton: {
    minHeight: 50,
    marginTop: 18,
    borderRadius: 23,
    backgroundColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planButtonActive: {
    backgroundColor: 'rgba(52,199,122,0.16)',
  },
  planButtonText: {
    ...font.black,
    color: '#062016',
    fontSize: 14,
  },
  planButtonTextActive: {
    color: '#8BD6B2',
  },
});

export default BillingScreen;
