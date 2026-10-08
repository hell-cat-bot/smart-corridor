import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface Props {
  photoUri: string | null;
  onPhotoSelected: (uri: string | null) => void;
}

export function PhotoPicker({ photoUri, onPhotoSelected }: Props) {
  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Access Required', 'Please allow camera access to capture the incident scene.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const dataUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        onPhotoSelected(dataUri);
      }
    } catch {
      Alert.alert('Error', 'Unable to launch camera.');
    }
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Gallery Access Required', 'Please allow photo library access to select an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const dataUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        onPhotoSelected(dataUri);
      }
    } catch {
      Alert.alert('Error', 'Unable to access photo library.');
    }
  };

  if (photoUri) {
    return (
      <View style={styles.previewCard}>
        <Image source={{ uri: photoUri }} style={styles.previewImage} resizeMode="cover" />
        <View style={styles.previewOverlay}>
          <View style={styles.aiTag}>
            <View style={styles.aiTagDot} />
            <Text style={styles.aiTagText}>AI Verification Ready</Text>
          </View>
          <View style={styles.actionPills}>
            <TouchableOpacity style={styles.pillButton} onPress={takePhoto}>
              <Text style={styles.pillButtonText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillButton, styles.pillButtonDanger]}
              onPress={() => onPhotoSelected(null)}
            >
              <Text style={styles.pillButtonDangerText}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badgeContainer}>
          <View style={styles.pulseDot} />
          <Text style={styles.badgeText}>Edge AI Vision</Text>
        </View>
      </View>

      <Text style={styles.title}>Attach Incident Photo (Optional)</Text>
      <Text style={styles.subtitle}>
        Visual feed helps AI verify hazard severity, vehicle access, and emergency triage priority.
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={takePhoto}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>📷</Text>
          <Text style={styles.primaryButtonText}>Take Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={pickImage}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonIcon}>🖼️</Text>
          <Text style={styles.secondaryButtonText}>Choose File</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    padding: 16,
    marginVertical: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 5,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563EB',
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    gap: 6,
  },
  buttonIcon: {
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: '#0F172A',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },
  previewCard: {
    height: 190,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: 4,
    backgroundColor: '#0F172A',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
  aiTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiTagDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22C55E',
  },
  aiTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  actionPills: {
    flexDirection: 'row',
    gap: 6,
  },
  pillButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  pillButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  pillButtonDanger: {
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
  },
  pillButtonDangerText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
