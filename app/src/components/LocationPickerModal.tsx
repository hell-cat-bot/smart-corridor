import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { POPULAR_JUNCTIONS, JunctionNode } from '../constants/emergency';

interface Props {
  visible: boolean;
  selectedNodeId: string;
  onSelect: (node: JunctionNode) => void;
  onClose: () => void;
}

export function LocationPickerModal({ visible, selectedNodeId, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('');

  const filtered = POPULAR_JUNCTIONS.filter(
    (j) =>
      j.name.toLowerCase().includes(query.toLowerCase()) ||
      j.id.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.dragBar} />
        
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Incident Location</Text>
            <Text style={styles.subtitle}>Select the nearest junction or corridor crossing</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search junction, crossing, flyover..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = item.id === selectedNodeId;
            return (
              <TouchableOpacity
                style={[styles.itemCard, isSelected && styles.itemCardSelected]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.pinCircle, isSelected && styles.pinCircleSelected]}>
                  <Text style={styles.pinIcon}>📍</Text>
                </View>
                <View style={styles.itemInfo}>
                  <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.id} · {item.lat.toFixed(4)}°N, {item.lng.toFixed(4)}°E
                  </Text>
                </View>
                {isSelected ? (
                  <View style={styles.checkBadge}>
                    <Text style={styles.checkIcon}>✓</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  searchIcon: {
    fontSize: 13,
    marginRight: 8,
    color: '#94A3B8',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0F172A',
  },
  clearText: {
    fontSize: 13,
    color: '#94A3B8',
    padding: 4,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemCardSelected: {
    backgroundColor: '#F1F5F9',
    borderColor: '#0F172A',
    borderWidth: 1.5,
  },
  pinCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pinCircleSelected: {
    backgroundColor: '#0F172A',
  },
  pinIcon: {
    fontSize: 15,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemNameSelected: {
    color: '#0F172A',
    fontWeight: '800',
  },
  itemMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  checkIcon: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
