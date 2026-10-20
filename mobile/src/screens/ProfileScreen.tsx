import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { AppButton } from '../components/AppButton';
import { getCurrentUser, fetchProfile, updateProfile, type UserProfile } from '../authApi';

export const ProfileScreen = ({ navigation }: any) => {
  const [user, setUser] = useState<UserProfile>(
    getCurrentUser() || {
      id: 1,
      name: 'Officer D.M. Senanayake',
      email: 'gajasaviya@gmail.com',
      phone: '+94 77 123 4567',
      role: 'Lead Agrarian Wildlife Officer',
      district: 'Anuradhapura',
      notifications_enabled: true,
      sms_alerts_enabled: true,
    }
  );

  const [pushAlerts, setPushAlerts] = useState(user.notifications_enabled);
  const [smsSirens, setSmsSirens] = useState(user.sms_alerts_enabled);
  const [lowPowerMode, setLowPowerMode] = useState(false);
  const [offlineCache, setOfflineCache] = useState(true);

  useEffect(() => {
    if (user?.email) {
      fetchProfile(user.email)
        .then((u) => {
          setUser(u);
          setPushAlerts(u.notifications_enabled);
          setSmsSirens(u.sms_alerts_enabled);
        })
        .catch(() => {});
    }
  }, []);

  const handleTogglePush = async (val: boolean) => {
    setPushAlerts(val);
    try {
      const updated = await updateProfile(user.email, { notifications_enabled: val });
      setUser(updated);
    } catch {}
  };

  const handleToggleSms = async (val: boolean) => {
    setSmsSirens(val);
    try {
      const updated = await updateProfile(user.email, { sms_alerts_enabled: val });
      setUser(updated);
    } catch {}
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out of Gajasaviya?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          navigation.getParent()?.replace('Auth');
        },
      },
    ]);
  };

  const handleEmergencyCall = () => {
    Linking.openURL('tel:1992').catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Hero Banner */}
        <View style={styles.heroCard}>
          <View style={styles.avatarContainer}>
            <Image
              source={require('../../assets/gajasaviya_logo.png')}
              style={styles.avatarLogo}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.userName}>{user.name}</Text>
          <View style={styles.rolePill}>
            <Ionicons name="shield-checkmark" size={14} color="#81C784" />
            <Text style={styles.roleText}>{user.role}</Text>
          </View>

          <Text style={styles.userSector}>
            {user.district} Sector • {user.email}
          </Text>

          {/* Stats Bar */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>42</Text>
              <Text style={styles.statLabel}>Alerts Handled</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>18</Text>
              <Text style={styles.statLabel}>Sightings Logged</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>99.4%</Text>
              <Text style={styles.statLabel}>Corridor Safe</Text>
            </View>
          </View>
        </View>

        {/* Section: Linked Devices & Mesh Info */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Linked Sensors & Telemetry</Text>

          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="radio-outline" size={18} color={Theme.colors.primary} />
            </View>
            <View style={styles.infoTextGroup}>
              <Text style={styles.infoTitle}>GPS Collar Sync</Text>
              <Text style={styles.infoSubtitle}>Connected to 4 Wildlife Radio Transponders</Text>
            </View>
            <View style={styles.activeDot} />
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIconWrapper}>
              <Ionicons name="call-outline" size={18} color={Theme.colors.primary} />
            </View>
            <View style={styles.infoTextGroup}>
              <Text style={styles.infoTitle}>Emergency Flash SMS</Text>
              <Text style={styles.infoSubtitle}>+94 77 123 4567 (Verified)</Text>
            </View>
            <Ionicons name="checkmark-circle" size={18} color="#2E7D32" />
          </View>
        </View>

        {/* Section: Alert Preferences */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Alert & Safety Preferences</Text>

          <View style={styles.preferenceRow}>
            <View style={styles.prefTextGroup}>
              <Text style={styles.prefTitle}>High-Priority Proximity Siren</Text>
              <Text style={styles.prefSubtitle}>
                Play audio alert when elephant is within 1.5 km
              </Text>
            </View>
            <Switch
              value={pushAlerts}
              onValueChange={handleTogglePush}
              trackColor={{ false: '#CFD8DC', true: '#81C784' }}
              thumbColor={pushAlerts ? Theme.colors.primary : '#FFFFFF'}
            />
          </View>

          <View style={styles.preferenceRow}>
            <View style={styles.prefTextGroup}>
              <Text style={styles.prefTitle}>SMS Broadcast Backup</Text>
              <Text style={styles.prefSubtitle}>
                Receive SMS even when cellular data is weak
              </Text>
            </View>
            <Switch
              value={smsSirens}
              onValueChange={handleToggleSms}
              trackColor={{ false: '#CFD8DC', true: '#81C784' }}
              thumbColor={smsSirens ? Theme.colors.primary : '#FFFFFF'}
            />
          </View>

          <View style={styles.preferenceRow}>
            <View style={styles.prefTextGroup}>
              <Text style={styles.prefTitle}>Offline Tactical Map Cache</Text>
              <Text style={styles.prefSubtitle}>
                Keep regional road vectors stored locally (128 MB)
              </Text>
            </View>
            <Switch
              value={offlineCache}
              onValueChange={setOfflineCache}
              trackColor={{ false: '#CFD8DC', true: '#81C784' }}
              thumbColor={offlineCache ? Theme.colors.primary : '#FFFFFF'}
            />
          </View>

          <View style={styles.preferenceRow}>
            <View style={styles.prefTextGroup}>
              <Text style={styles.prefTitle}>Battery Saver Mode</Text>
              <Text style={styles.prefSubtitle}>Reduce background GPS ping interval</Text>
            </View>
            <Switch
              value={lowPowerMode}
              onValueChange={setLowPowerMode}
              trackColor={{ false: '#CFD8DC', true: '#81C784' }}
              thumbColor={lowPowerMode ? Theme.colors.primary : '#FFFFFF'}
            />
          </View>
        </View>

        {/* Section: Support & Hotline */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionHeader}>Emergency & Resources</Text>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleEmergencyCall}
          >
            <View style={[styles.infoIconWrapper, { backgroundColor: '#FFEBEE' }]}>
              <Ionicons name="call" size={18} color="#D32F2F" />
            </View>
            <View style={styles.infoTextGroup}>
              <Text style={[styles.infoTitle, { color: '#D32F2F' }]}>
                DWC Wildlife Emergency 1992
              </Text>
              <Text style={styles.infoSubtitle}>Department of Wildlife Conservation Hotline</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8A9E96" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() =>
              Alert.alert(
                'Elephant Encounter Guide',
                '1. Stay Calm & Maintain 100m distance.\n2. Do NOT shine bright flashlights or honk loudly.\n3. Identify wind direction and back away slowly.\n4. Call 1992 immediately.'
              )
            }
          >
            <View style={styles.infoIconWrapper}>
              <Ionicons name="book-outline" size={18} color={Theme.colors.primary} />
            </View>
            <View style={styles.infoTextGroup}>
              <Text style={styles.infoTitle}>Encounter Safety Protocol</Text>
              <Text style={styles.infoSubtitle}>Field guide for residents & drivers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8A9E96" />
          </TouchableOpacity>
        </View>

        {/* Sign Out Button */}
        <AppButton
          title="Sign Out"
          type="outline"
          icon="log-out-outline"
          onPress={handleLogout}
          style={styles.logoutBtn}
        />

        <Text style={styles.appVersion}>
          Gajasaviya Mobile v1.0.0 (Research Build) • Gajasaviya HEC
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D2818',
  },
  scrollContent: {
    padding: 16,
    backgroundColor: Theme.colors.background,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#0D2818',
    borderRadius: Theme.borderRadius.large,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    ...Theme.shadows.medium,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: '#2E7D32',
    marginBottom: 12,
    padding: 6,
    ...Theme.shadows.small,
  },
  avatarLogo: {
    width: '100%',
    height: '100%',
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 125, 50, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 6,
    marginBottom: 6,
  },
  roleText: {
    color: '#A5D6A7',
    fontSize: 12,
    fontWeight: '600',
  },
  userSector: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    marginBottom: 18,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: Theme.borderRadius.medium,
    paddingVertical: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 10,
    color: '#A5D6A7',
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 16,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoTextGroup: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  infoSubtitle: {
    fontSize: 12,
    color: Theme.colors.textLight,
    marginTop: 1,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00E676',
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  prefTextGroup: {
    flex: 1,
    paddingRight: 10,
  },
  prefTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  prefSubtitle: {
    fontSize: 11,
    color: Theme.colors.textLight,
    marginTop: 2,
    lineHeight: 15,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  logoutBtn: {
    marginVertical: 12,
    borderColor: '#D32F2F',
  },
  appVersion: {
    textAlign: 'center',
    fontSize: 11,
    color: Theme.colors.textLight,
    marginTop: 8,
  },
});
