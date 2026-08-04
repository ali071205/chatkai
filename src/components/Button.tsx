import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacityProps,
} from 'react-native';
import { font } from '../theme/typography';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

const Button: React.FC<ButtonProps> = ({
  title,
  loading = false,
  variant = 'primary',
  style,
  ...props
}) => {
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      style={[
        styles.button,
        isPrimary ? styles.primary : styles.secondary,
        props.disabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.85}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#0A0A0A' : '#F5F5F5'} />
      ) : (
        <Text style={[
          styles.text,
          isPrimary ? styles.textPrimary : styles.textSecondary,
        ]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 54,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primary: {
    backgroundColor: '#F5F5F5',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  secondary: {
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#343434',
  },
  disabled: {
    opacity: 0.55,
  },
  text: {
    ...font.black,
    fontSize: 16,
  },
  textPrimary: {
    color: '#0A0A0A',
  },
  textSecondary: {
    color: '#F5F5F5',
  },
});

export default Button;
