import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>NOVA MEMBERSHIP</Text>
        <Text style={styles.title}>Choose your plan</Text>
        <Text style={styles.subtitle}>
          Unlock your NOVA plan with a secure Razorpay checkout.
        </Text>

        {isTestMode && (
          <View style={styles.testModeBanner}>
            <Text style={styles.testModeText}>Test Mode — no real money is charged.</Text>
          </View>
        )}

        {activeSubscription && (
          <View style={styles.activePlanCard}>
            <CheckSquare size={22} color="#0A0A0A" weight="fill" />
            <View style={styles.activePlanCopy}>
              <Text style={styles.activePlanTitle}>{activeSubscription.planName} active</Text>
              <Text style={styles.activePlanText}>{formatExpiry(activeSubscription.expiresAt)}</Text>
            </View>
          </View>
        )}

        <View style={styles.planList}>
          {plans.map(plan => {
            const isActive = activeSubscription?.planId === plan.id;
            const isProcessing = processingPlanId === plan.id;
            return (
              <View key={plan.id} style={[styles.planCard, isActive && styles.planCardActive]}>
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
                  <Text style={[styles.planButtonText, isActive && styles.planButtonTextActive]}>
                    {isActive ? 'Current plan' : isProcessing ? 'Opening checkout...' : `Choose ${plan.name}`}
                  </Text>
                </TouchableOpacity>
              </View>
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
    backgroundColor: '#000000',
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 40,
  },
  eyebrow: {
    ...font.bold,
    color: '#A3A3A3',
    fontSize: 12,
    letterSpacing: 1.2,
  },
  title: {
    ...font.black,
    color: '#F8FAFC',
    fontSize: 32,
    lineHeight: 38,
    marginTop: 8,
  },
  subtitle: {
    ...font.regular,
    color: '#A3A3A3',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  testModeBanner: {
    marginTop: 22,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  testModeText: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 13,
  },
  activePlanCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    flexDirection: 'row',
    alignItems: 'center',
  },
  activePlanCopy: {
    marginLeft: 11,
  },
  activePlanTitle: {
    ...font.black,
    color: '#0A0A0A',
    fontSize: 15,
  },
  activePlanText: {
    ...font.regular,
    color: '#4A4A4A',
    fontSize: 12,
    marginTop: 2,
  },
  planList: {
    marginTop: 24,
  },
  planCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#303030',
    marginBottom: 14,
  },
  planCardActive: {
    borderColor: '#F5F5F5',
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
    color: '#A3A3A3',
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
    color: '#B8B8B8',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 18,
  },
  planButton: {
    minHeight: 46,
    marginTop: 18,
    borderRadius: 23,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planButtonActive: {
    backgroundColor: '#2A2A2A',
  },
  planButtonText: {
    ...font.black,
    color: '#0A0A0A',
    fontSize: 14,
  },
  planButtonTextActive: {
    color: '#A3A3A3',
  },
});

export default BillingScreen;
