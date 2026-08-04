import React from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';

const App = () => {
  // 20 boxes create karne ke liye array
  const boxes = Array.from({ length: 20 }, (_, i) => i + 1);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {boxes.map((item) => (
        <View key={item} style={styles.box}>
          <Text style={styles.boxText}>Box {item}</Text>
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  box: {
    width: 250,
    height: 100,
    backgroundColor: '#3498db',
    marginVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    elevation: 3,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  boxText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
});

export default App;