import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
} from "react-native";
import { router } from "expo-router";
import {
  SERVICE,
  ServiceType,
  EMERGENCY_CLASSES,
  PRIORITY_CONFIG,
  POPULAR_JUNCTIONS,
  JunctionNode,
} from "../constants/emergency";
import { PhotoPicker } from "../components/PhotoPicker";
import { LocationPickerModal } from "../components/LocationPickerModal";
import { submitEmergency } from "../services/emergencyService";

export default function ReportScreen() {
  const [service, setService] = useState<ServiceType>(SERVICE.MEDICAL);
  const [selectedClassId, setSelectedClassId] = useState<string>("cardiac");
  const [customDescription, setCustomDescription] = useState("");
  const [selectedNode, setSelectedNode] = useState<JunctionNode>(
    POPULAR_JUNCTIONS[0],
  );
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const classes = EMERGENCY_CLASSES[service];
  const currentClass =
    classes.find((c) => c.id === selectedClassId) || classes[0];
  const priority = currentClass?.priority ?? 2;
  const priorityInfo = PRIORITY_CONFIG[priority];

  const handleServiceChange = (s: ServiceType) => {
    setService(s);
    const first = EMERGENCY_CLASSES[s][0];
    setSelectedClassId(first.id);
  };

  const handleSubmit = async () => {
    if (selectedClassId === "custom" && !customDescription.trim()) {
      Alert.alert(
        "Missing Detail",
        "Please enter a brief description of the incident.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const emergencyLabel =
        selectedClassId === "custom"
          ? customDescription.trim()
          : currentClass.label;

      const report = await submitEmergency({
        service,
        emergencyClass: selectedClassId,
        emergencyLabel,
        priority,
        sceneNode: selectedNode.id,
        sceneName: selectedNode.name,
        note,
        photoUri: photoUri || undefined,
      });

      Alert.alert(
        "Emergency Alert Transmitted",
        `Incident ref #${report.id} registered.\n\nType: ${emergencyLabel} (${priorityInfo.label})\nLocation: ${selectedNode.name}\n\nTraffic corridor preemption and nearest available units have been dispatched.`,
        [
          {
            text: "Track Response",
            onPress: () => router.push("/reports"),
          },
          {
            text: "Done",
            style: "cancel",
          },
        ],
      );

      setPhotoUri(null);
      setNote("");
      setCustomDescription("");
    } catch {
      Alert.alert(
        "Transmission Error",
        "Could not transmit emergency call. Please dial emergency helpline 112 immediately.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <View style={styles.statusPill}>
          <View style={styles.liveDot} />
          <Text style={styles.statusPillText}>5G DISPATCH NETWORK</Text>
        </View>

        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => router.push("/reports")}
          activeOpacity={0.7}
        >
          <Text style={styles.historyBtnIcon}>📋</Text>
          <Text style={styles.historyBtnText}>My Calls</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Screen Title */}
        <View style={styles.headerBlock}>
          <Text style={styles.screenHeading}>Emergency Report</Text>
          <Text style={styles.screenSub}>
            Instant dispatch alert · Nearest units routed via AI green corridor
          </Text>
        </View>

        {/* 1. Service Selection */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionNumber}>01</Text>
          <Text style={styles.sectionLabel}>SELECT EMERGENCY SERVICE</Text>
        </View>

        <View style={styles.serviceRow}>
          <TouchableOpacity
            style={[
              styles.serviceCard,
              service === SERVICE.MEDICAL && styles.serviceCardMedicalActive,
            ]}
            onPress={() => handleServiceChange(SERVICE.MEDICAL)}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.serviceIconWrap,
                service === SERVICE.MEDICAL && styles.serviceIconWrapMedical,
              ]}
            >
              <Text style={styles.serviceIcon}>🚑</Text>
            </View>
            <Text
              style={[
                styles.serviceTitle,
                service === SERVICE.MEDICAL && styles.serviceTitleMedical,
              ]}
            >
              Medical / EMS
            </Text>
            <Text style={styles.serviceSubtitle}>
              Cardiac, trauma, stroke, accidents
            </Text>
            {service === SERVICE.MEDICAL ? (
              <View
                style={[
                  styles.activeCheckBadge,
                  { backgroundColor: "#0F172A" },
                ]}
              >
                <Text style={styles.activeCheckText}>✓</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.serviceCard,
              service === SERVICE.FIRE && styles.serviceCardFireActive,
            ]}
            onPress={() => handleServiceChange(SERVICE.FIRE)}
            activeOpacity={0.8}
          >
            <View
              style={[
                styles.serviceIconWrap,
                service === SERVICE.FIRE && styles.serviceIconWrapFire,
              ]}
            >
              <Text style={styles.serviceIcon}>🚒</Text>
            </View>
            <Text
              style={[
                styles.serviceTitle,
                service === SERVICE.FIRE && styles.serviceTitleFire,
              ]}
            >
              Fire & Rescue
            </Text>
            <Text style={styles.serviceSubtitle}>
              Blazes, hazmat, technical extraction
            </Text>
            {service === SERVICE.FIRE ? (
              <View
                style={[
                  styles.activeCheckBadge,
                  { backgroundColor: "#0F172A" },
                ]}
              >
                <Text style={styles.activeCheckText}>✓</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>

        {/* 2. Incident Classification */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionNumber}>02</Text>
          <Text style={styles.sectionLabel}>INCIDENT TYPE & PRIORITY</Text>
        </View>

        <View style={styles.classGrid}>
          {classes.map((c) => {
            const isSelected = c.id === selectedClassId;
            const itemPriority = PRIORITY_CONFIG[c.priority];
            return (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.classCard,
                  isSelected && styles.classCardSelected,
                ]}
                onPress={() => setSelectedClassId(c.id)}
                activeOpacity={0.7}
              >
                <View style={styles.classCardContent}>
                  <Text
                    style={[
                      styles.classLabel,
                      isSelected && styles.classLabelSelected,
                    ]}
                  >
                    {c.label}
                  </Text>
                  <View
                    style={[
                      styles.microPriorityBadge,
                      {
                        backgroundColor: isSelected
                          ? "rgba(255,255,255,0.18)"
                          : itemPriority.bg,
                        borderWidth: 1,
                        borderColor: isSelected
                          ? "rgba(255,255,255,0.3)"
                          : itemPriority.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.microPriorityText,
                        { color: isSelected ? "#FFFFFF" : itemPriority.color },
                      ]}
                    >
                      P{c.priority}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedClassId === "custom" ? (
          <TextInput
            style={styles.customInput}
            value={customDescription}
            onChangeText={setCustomDescription}
            placeholder="Describe the specific emergency condition..."
            placeholderTextColor="#94A3B8"
            returnKeyType="done"
          />
        ) : null}

        {/* Live Priority Notice */}
        <View
          style={[
            styles.priorityBanner,
            {
              borderColor: priorityInfo.border,
              backgroundColor: priorityInfo.bg,
            },
          ]}
        >
          <View
            style={[
              styles.priorityBadge,
              { backgroundColor: priorityInfo.color },
            ]}
          >
            <Text style={styles.priorityBadgeText}>{priorityInfo.label}</Text>
          </View>
          <Text
            style={[styles.priorityBannerDesc, { color: priorityInfo.color }]}
          >
            {priorityInfo.desc}
          </Text>
        </View>

        {/* 3. Location Selector */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionNumber}>03</Text>
          <Text style={styles.sectionLabel}>SCENE LOCATION / CORRIDOR</Text>
        </View>

        <TouchableOpacity
          style={styles.locationCard}
          onPress={() => setLocationModalVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.locationIconBox}>
            <Text style={styles.locationPin}>📍</Text>
          </View>
          <View style={styles.locationDetails}>
            <Text style={styles.locationSubLabel}>NEAREST JUNCTION</Text>
            <Text style={styles.locationName} numberOfLines={1}>
              {selectedNode.name}
            </Text>
            <Text style={styles.locationCoordinates}>
              Node {selectedNode.id} · {selectedNode.lat.toFixed(4)}°N,{" "}
              {selectedNode.lng.toFixed(4)}°E
            </Text>
          </View>
          <View style={styles.changeLocationPill}>
            <Text style={styles.changeLocationText}>Change ›</Text>
          </View>
        </TouchableOpacity>

        {/* 4. Incident Photo */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionNumber}>04</Text>
          <Text style={styles.sectionLabel}>VISUAL EVIDENCE (OPTIONAL)</Text>
        </View>

        <PhotoPicker photoUri={photoUri} onPhotoSelected={setPhotoUri} />

        {/* 5. Additional Notes */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionNumber}>05</Text>
          <Text style={styles.sectionLabel}>
            ADDITIONAL DISPATCH NOTES (OPTIONAL)
          </Text>
        </View>

        <TextInput
          style={styles.notesInput}
          value={note}
          onChangeText={setNote}
          placeholder="Landmarks, trapped casualties, gate number, hazardous smoke..."
          placeholderTextColor="#94A3B8"
          multiline
          numberOfLines={3}
        />

        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.transmitButton,
            submitting && styles.transmitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <View style={styles.transmitButtonContent}>
              <Text style={styles.transmitIcon}>🚨</Text>
              <Text style={styles.transmitText}>TRANSMIT EMERGENCY ALERT</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.legalNotice}>
          In immediate life threat situations, call{" "}
          <Text style={styles.legalHighlight}>112</Text> directly.
        </Text>
      </ScrollView>

      {/* Location Picker Modal */}
      <LocationPickerModal
        visible={locationModalVisible}
        selectedNodeId={selectedNode.id}
        onSelect={setSelectedNode}
        onClose={() => setLocationModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 4 : 0,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#16A34A",
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.4,
  },
  historyBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  historyBtnIcon: {
    fontSize: 12,
  },
  historyBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 48,
  },
  headerBlock: {
    marginBottom: 20,
  },
  screenHeading: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.6,
  },
  screenSub: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 10,
    gap: 6,
  },
  sectionNumber: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#334155",
    letterSpacing: 0.6,
  },
  serviceRow: {
    flexDirection: "row",
    gap: 12,
  },
  serviceCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 14,
    position: "relative",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  serviceCardMedicalActive: {
    borderColor: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  serviceCardFireActive: {
    borderColor: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  serviceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  serviceIconWrapMedical: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  serviceIconWrapFire: {
    borderColor: "#FDBA74",
    backgroundColor: "#FFF7ED",
  },
  serviceIcon: {
    fontSize: 22,
  },
  serviceTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
    marginBottom: 3,
  },
  serviceTitleMedical: {
    color: "#0F172A",
  },
  serviceTitleFire: {
    color: "#0F172A",
  },
  serviceSubtitle: {
    fontSize: 11,
    color: "#64748B",
    lineHeight: 15,
  },
  activeCheckBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  activeCheckText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  classGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  classCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },
  classCardSelected: {
    backgroundColor: "#0F172A",
    borderColor: "#0F172A",
  },
  classCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  classLabel: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#334155",
  },
  classLabelSelected: {
    color: "#FFFFFF",
  },
  microPriorityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  microPriorityText: {
    fontSize: 9.5,
    fontWeight: "800",
  },
  customInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
    fontSize: 13.5,
    color: "#0F172A",
  },
  priorityBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 12,
    gap: 10,
  },
  priorityBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  priorityBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  priorityBannerDesc: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "600",
  },
  locationCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 13,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  locationIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  locationPin: {
    fontSize: 18,
  },
  locationDetails: {
    flex: 1,
  },
  locationSubLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.4,
  },
  locationName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 1,
  },
  locationCoordinates: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    fontFamily: "monospace",
  },
  changeLocationPill: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  changeLocationText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#0F172A",
  },
  notesInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: "#0F172A",
    minHeight: 72,
    textAlignVertical: "top",
  },
  transmitButton: {
    backgroundColor: "#DC2626",
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  transmitButtonDisabled: {
    opacity: 0.65,
  },
  transmitButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  transmitIcon: {
    fontSize: 18,
  },
  transmitText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  legalNotice: {
    fontSize: 11,
    color: "#64748B",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 16,
  },
  legalHighlight: {
    color: "#DC2626",
    fontWeight: "700",
  },
});
