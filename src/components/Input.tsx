import React from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps } from 'react-native';
import { font } from '../theme/typography';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
}

const Input: React.FC<InputProps> = ({ label, error, ...props }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        placeholderTextColor="#777777"
        {...props}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
    width: '100%',
  },
  label: {
    ...font.bold,
    fontSize: 13,
    color: '#D4D4D4',
    marginBottom: 8,
  },
  input: {
    ...font.regular,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#F8FAFC',
    fontSize: 15,
    minHeight: 52,
  },
  inputError: {
    borderColor: '#F5F5F5',
  },
  errorText: {
    ...font.bold,
    color: '#F5F5F5',
    fontSize: 12,
    marginTop: 5,
  },
});

export default Input;
