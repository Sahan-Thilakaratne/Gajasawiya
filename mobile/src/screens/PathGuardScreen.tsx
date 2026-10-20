import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { PathGuardMapComponent } from '../components/PathGuardMapComponent';
import { useFocusEffect } from '@react-navigation/native';
import {
  calculateSafePath,
  checkPathGuardHealth,
  fetchThreats,
  postElephantThreat,
  routeToLatLngs,
  submitSighting,
  syncComp4Network,
  type ThreatEvent,
} from '../pathGuardApi';
import {
  autoGenerateWanderEndpoints,
  isPickNearWander,
  wanderZoneEnvelope,
} from '../comp4Wander';
import type { Playback } from '../api';

const COMP2_API = process.env.EXPO_PUBLIC_COMP2_API ?? 'http://10.0.2.2:8001';

const BEHAVIORS = ['Calm', 'Feeding', 'Social Herd', 'Musth / Aggressive'];

export const PathGuardScreen = () => {
  const [activeTab, setActiveTab] = useState<'route' | 'report' | 'threats'>('route');
  const [threats, setThreats] = useState<ThreatEvent[]>([]);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [wanderZone, setWanderZone] = useState<{ lat: number; lng: number; radiusM: number } | null>(null);

  // Interactive map point selection mode
  const [pickMode, setPickMode] = useState<'origin' | 'dest' | null>(null);

  const [origin, setOrigin] = useState<{ lat: number; lng: number }>({ lat: 8.3114, lng: 80.4037 });
  const [dest, setDest] = useState<{ lat: number; lng: number }>({ lat: 8.328, lng: 80.425 });

  const [originText, setOriginText] = useState('8.3114, 80.4037');
  const [destText, setDestText] = useState('8.3280, 80.4250');

  const [safeCoords, setSafeCoords] = useState<[number, number][] | null>(null);
  const [shortCoords, setShortCoords] = useState<[number, number][] | null>(null);

  const [routeMeta, setRouteMeta] = useState<{
    threatsOnShortest: number;
    activeThreats: number;
  } | null>(null);

  // Sighting reporting state
  const [sightingLat, setSightingLat] = useState('8.3150');
  const [sightingLng, setSightingLng] = useState('80.4100');
  const [behavior, setBehavior] = useState('Social Herd');
  const [description, setDescription] = useState('');
  const [mlResult, setMlResult] = useState<{
    confidence: number;
    status: string;
  } | null>(null);

  const [health, setHealth] = useState({ apiUp: false, mlUp: false });
  const [loading, setLoading] = useState(false);
  const [syncingSim, setSyncingSim] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadThreats = useCallback(async () => {
    const data = await fetchThreats();
    setThreats(data);
  }, []);

  // Fetch the latest simulation playback from Comp-2 and sync into Comp-4
  const syncWithLatestSimulation = useCallback(async () => {
    setSyncingSim(true);
    setError(null);
    try {
      const res = await fetch(`${COMP2_API}/api/v1/playback?_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) {
        throw new Error('No active simulation found on Comp-2. Please run Step 2 (Tracker) on Dashboard first.');
      }
      const pb: Playback = await res.json();
      setPlayback(pb);

      // Clear previous routes when a new simulation arrives
      setSafeCoords(null);
      setShortCoords(null);
      setRouteMeta(null);

      // Compute Wander Zone
      const wz = wanderZoneEnvelope(pb);
      setWanderZone(wz);

      // Sync road network graph in Comp-4
      if (pb.frames && pb.frames.length > 0) {
        await syncComp4Network(pb.frames);

        const fr = pb.frames[0];
        if (fr?.lat_est && fr?.lon_est) {
          await postElephantThreat({
            latitude: fr.lat_est,
            longitude: fr.lon_est,
            radius_meters: Math.max(fr.uncertainty_radius_m || 500, 400),
          });
        }

        // Auto-align endpoints within the newly simulated wandering corridor
        const autoPts = autoGenerateWanderEndpoints(pb);
        if (autoPts) {
          setOrigin(autoPts.origin);
          setDest(autoPts.dest);
          setOriginText(`${autoPts.origin.lat}, ${autoPts.origin.lng}`);
          setDestText(`${autoPts.dest.lat}, ${autoPts.dest.lng}`);
          setSightingLat(String(autoPts.origin.lat));
          setSightingLng(String(autoPts.origin.lng));
        }
      }

      await loadThreats();
    } catch (e: any) {
      setError(e?.message || 'Failed to sync with live simulation');
    } finally {
      setSyncingSim(false);
    }
  }, [loadThreats]);

  // Auto-refresh every time the user navigates or switches to the Path Guard tab
  useFocusEffect(
    useCallback(() => {
      checkPathGuardHealth().then(setHealth);
      loadThreats();
      syncWithLatestSimulation();
    }, [loadThreats, syncWithLatestSimulation])
  );

  // Handle direct tap on the map to set Origin or Destination
  const handleMapTap = (tapLat: number, tapLng: number) => {
    const lat = Number(tapLat.toFixed(5));
    const lng = Number(tapLng.toFixed(5));

    // If a simulation is loaded, warn if pick is far outside the wander zone
    if (playback && !isPickNearWander(lat, lng, playback)) {
      Alert.alert(
        'Point Outside Wander Zone',
        'This location is far outside the active elephant wander zone. For best results, tap within or near the dashed emerald zone.'
      );
    }

    if (pickMode === 'origin') {
      setOrigin({ lat, lng });
      setOriginText(`${lat}, ${lng}`);
      setPickMode(null);
      setError(null);
    } else if (pickMode === 'dest') {
      setDest({ lat, lng });
      setDestText(`${lat}, ${lng}`);
      setPickMode(null);
      setError(null);
    } else {
      // Default: if no pick mode is selected, set as Origin first or update Sighting coords in report tab
      if (activeTab === 'report') {
        setSightingLat(String(lat));
        setSightingLng(String(lng));
        Alert.alert('Sighting Point Set', `Coordinates updated to ${lat}, ${lng}`);
      } else {
        setOrigin({ lat, lng });
        setOriginText(`${lat}, ${lng}`);
      }
    }
  };

  const handleCalculateRoute = async () => {
    setError(null);
    setLoading(true);

    try {
      const [oLat, oLng] = originText.split(',').map((s) => parseFloat(s.trim()));
      const [dLat, dLng] = destText.split(',').map((s) => parseFloat(s.trim()));

      if (isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
        throw new Error('Please enter valid "lat, lon" coordinates for origin and destination.');
      }

      const curOrigin = { lat: oLat, lng: oLng };
      const curDest = { lat: dLat, lng: dLng };
      setOrigin(curOrigin);
      setDest(curDest);

      // Ensure network is synced
      if (playback?.frames && playback.frames.length > 0) {
        await syncComp4Network(playback.frames);
      }

      const res = await calculateSafePath({
        origin_lat: curOrigin.lat,
        origin_lng: curOrigin.lng,
        dest_lat: curDest.lat,
        dest_lng: curDest.lng,
      });

      if (!res.success || !res.data) {
        throw new Error(res.error || 'Routing failed: Points must be near the simulated elephant corridor.');
      }

      setSafeCoords(routeToLatLngs(res.data.safe_route.coordinates));
      setShortCoords(routeToLatLngs(res.data.shortest_route.coordinates));
      setRouteMeta({
        threatsOnShortest: res.data.shortest_route.threats_on_path,
        activeThreats: res.data.active_threats_count,
      });

      const updatedThreats = await fetchThreats();
      setThreats(updatedThreats);
    } catch (e: any) {
      setError(e?.message || 'Could not calculate safe route');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitSighting = async () => {
    const lat = parseFloat(sightingLat);
    const lng = parseFloat(sightingLng);

    if (isNaN(lat) || isNaN(lng)) {
      setError('Please provide valid latitude and longitude coordinates');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await submitSighting({
        reported_latitude: lat,
        reported_longitude: lng,
        device_latitude: lat,
        device_longitude: lng,
        elephant_behavior: behavior,
        description: description.trim() || 'Elephant spotted in corridor',
      });

      if (!res.success || !res.data) {
        throw new Error(res.error || 'ML verification failed');
      }

      setMlResult({
        confidence: res.data.ml_confidence,
        status: res.data.verification_status,
      });

      Alert.alert(
        'Sighting Verified by AI',
        `Verification Status: ${res.data.verification_status.toUpperCase()}\nML Confidence Score: ${(
          res.data.ml_confidence * 100
        ).toFixed(1)}%`
      );

      loadThreats();
    } catch (e: any) {
      setError(e?.message || 'Sighting submission failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="shield-half" size={14} color="#81C784" />
            <Text style={styles.badgeText}>COMPONENT 4 · PATH GUARD AI</Text>
          </View>
          <Text style={styles.headerTitle}>Dynamic Threat & Safe Routing</Text>
          <Text style={styles.headerDesc}>
            Dijkstra safe-path routing through the elephant wandering zone corridor.
          </Text>

          {/* Health Status Bar */}
          <View style={styles.healthRow}>
            <View
              style={[
                styles.healthBadge,
                health.apiUp ? styles.healthUp : styles.healthDown,
              ]}
            >
              <Text style={styles.healthText}>
                Path Guard (5001): {health.apiUp ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
            <View
              style={[
                styles.healthBadge,
                health.mlUp ? styles.healthUp : styles.healthDown,
              ]}
            >
              <Text style={styles.healthText}>
                ML Verifier : {health.mlUp ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'route' && styles.tabButtonActive]}
            onPress={() => setActiveTab('route')}
          >
            <Ionicons
              name="navigate"
              size={15}
              color={activeTab === 'route' ? '#FFFFFF' : Theme.colors.textSecondary}
            />
            <Text
              style={[styles.tabButtonText, activeTab === 'route' && styles.tabButtonTextActive]}
            >
              Safe Routing
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'report' && styles.tabButtonActive]}
            onPress={() => setActiveTab('report')}
          >
            <Ionicons
              name="eye"
              size={15}
              color={activeTab === 'report' ? '#FFFFFF' : Theme.colors.textSecondary}
            />
            <Text
              style={[styles.tabButtonText, activeTab === 'report' && styles.tabButtonTextActive]}
            >
              ML Sighting
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'threats' && styles.tabButtonActive]}
            onPress={() => setActiveTab('threats')}
          >
            <Ionicons
              name="warning"
              size={15}
              color={activeTab === 'threats' ? '#FFFFFF' : Theme.colors.textSecondary}
            />
            <Text
              style={[styles.tabButtonText, activeTab === 'threats' && styles.tabButtonTextActive]}
            >
              Threats ({threats.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Error Banner */}
        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={18} color="#D32F2F" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* TAB 1: SAFE ROUTING */}
        {activeTab === 'route' && (
          <>
            {/* Sync Simulation & Point Picker Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderWithAction}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardSectionTitle}>Elephant Wander Corridor</Text>
                  <Text style={styles.cardSubtitle}>
                    {wanderZone
                      ? `Corridor synced at (${wanderZone.lat.toFixed(3)}, ${wanderZone.lng.toFixed(3)}) · Radius ${(wanderZone.radiusM / 1000).toFixed(1)} km`
                      : 'Sync road graph with Component-2 EKF tracking simulation.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.syncBtn}
                  onPress={syncWithLatestSimulation}
                  disabled={syncingSim}
                >
                  <Ionicons name="sync" size={14} color="#FFFFFF" />
                  <Text style={styles.syncBtnText}>
                    {syncingSim ? 'Syncing...' : 'Sync Corridor'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Interactive Tap-on-Map Selection Toolbar */}
              <View style={styles.pickBar}>
                <TouchableOpacity
                  style={[
                    styles.pickBtn,
                    styles.pickBtnOrigin,
                    pickMode === 'origin' && styles.pickBtnActiveOrigin,
                  ]}
                  onPress={() => setPickMode(pickMode === 'origin' ? null : 'origin')}
                >
                  <Ionicons
                    name="location"
                    size={15}
                    color={pickMode === 'origin' ? '#FFFFFF' : '#1565C0'}
                  />
                  <Text
                    style={[
                      styles.pickBtnText,
                      { color: pickMode === 'origin' ? '#FFFFFF' : '#1565C0' },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {pickMode === 'origin' ? '👉 Tap Start' : '📍 Pick Start'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.pickBtn,
                    styles.pickBtnDest,
                    pickMode === 'dest' && styles.pickBtnActiveDest,
                  ]}
                  onPress={() => setPickMode(pickMode === 'dest' ? null : 'dest')}
                >
                  <Ionicons
                    name="flag"
                    size={15}
                    color={pickMode === 'dest' ? '#FFFFFF' : '#7C3AED'}
                  />
                  <Text
                    style={[
                      styles.pickBtnText,
                      { color: pickMode === 'dest' ? '#FFFFFF' : '#7C3AED' },
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {pickMode === 'dest' ? '👉 Tap End' : '🎯 Pick End'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputsRow}>
                <View style={{ flex: 1 }}>
                  <AppInput
                    label="Origin (Start)"
                    value={originText}
                    onChangeText={setOriginText}
                    placeholder="8.3114, 80.4037"
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <AppInput
                    label="Destination (End)"
                    value={destText}
                    onChangeText={setDestText}
                    placeholder="8.3280, 80.4250"
                  />
                </View>
              </View>

              <AppButton
                title={loading ? 'Calculating Safe Avoidance Path...' : 'Calculate Safe Avoidance Route'}
                icon="shield-checkmark-outline"
                onPress={handleCalculateRoute}
                loading={loading}
                size="medium"
              />

              {routeMeta && (
                <View style={styles.routeSummaryBox}>
                  <View style={styles.routeSummaryHeader}>
                    <Ionicons name="shield-checkmark" size={20} color="#D97706" style={{ marginTop: 1 }} />
                    <View style={styles.routeSummaryTextCol}>
                      <Text style={styles.routeSummaryTitle}>
                        Safe Bypass Path (Yellow) Calculated
                      </Text>
                      <Text style={styles.routeSummarySub}>
                        Avoids Elephant Hazards
                      </Text>
                    </View>
                  </View>
                  <View style={styles.threatAvoidedBadge}>
                    <Text style={styles.threatAvoidedText}>
                      Avoided {routeMeta.threatsOnShortest} Direct Elephant Threat Zones
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Interactive Map with Tap Selection */}
            {pickMode && (
              <View
                style={[
                  styles.pickActiveBanner,
                  pickMode === 'origin' ? styles.pickActiveOrigin : styles.pickActiveDest,
                ]}
              >
                <Ionicons
                  name={pickMode === 'origin' ? 'location' : 'flag'}
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.pickActiveBannerText}>
                  {pickMode === 'origin'
                    ? 'Tap map to set Trip Start'
                    : 'Tap map to set Trip End'}
                </Text>
                <TouchableOpacity onPress={() => setPickMode(null)}>
                  <Ionicons name="close-circle" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.mapContainer}>
              <View style={styles.mapHeaderRow}>
                <Ionicons name="map-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.mapTitle}>
                  {pickMode === 'origin'
                    ? '📍 TAP MAP TO SET TRIP START'
                    : pickMode === 'dest'
                    ? '🎯 TAP MAP TO SET TRIP DESTINATION'
                    : 'Safe Bypass vs Direct Route in Wander Zone'}
                </Text>
              </View>
              <PathGuardMapComponent
                threats={threats}
                playback={playback}
                safeRoute={safeCoords}
                shortestRoute={shortCoords}
                origin={origin}
                destination={dest}
                wanderZone={wanderZone}
                onMapTap={handleMapTap}
                pickMode={pickMode}
                height={380}
              />
            </View>
          </>
        )}

        {/* TAB 2: REPORT ML SIGHTING */}
        {activeTab === 'report' && (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Report Elephant Sighting</Text>
            <Text style={styles.cardSubtitle}>
              Sightings are verified by the ML Microservice (Port 8004) to compute confidence and broadcast threat zones. Tap the map to auto-fill coordinates.
            </Text>

            <View style={styles.inputsRow}>
              <View style={{ flex: 1 }}>
                <AppInput
                  label="Latitude"
                  value={sightingLat}
                  onChangeText={setSightingLat}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <AppInput
                  label="Longitude"
                  value={sightingLng}
                  onChangeText={setSightingLng}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>Observed Elephant Behavior</Text>
            <View style={styles.behaviorRow}>
              {BEHAVIORS.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[
                    styles.behaviorChip,
                    behavior === b && styles.behaviorChipActive,
                  ]}
                  onPress={() => setBehavior(b)}
                >
                  <Text
                    style={[
                      styles.behaviorChipText,
                      behavior === b && styles.behaviorChipTextActive,
                    ]}
                  >
                    {b}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <AppInput
              label="Description / Context"
              placeholder="e.g. Bull elephant approaching village paddy field boundary"
              value={description}
              onChangeText={setDescription}
            />

            <AppButton
              title={loading ? 'Running ML Credibility Model...' : 'Submit to ML Verifier'}
              icon="sparkles-outline"
              onPress={handleSubmitSighting}
              loading={loading}
              size="medium"
            />

            {mlResult && (
              <View style={styles.mlResultCard}>
                <View style={styles.mlResultHeader}>
                  <Ionicons name="checkmark-circle" size={20} color="#2E7D32" />
                  <Text style={styles.mlResultTitle}>
                    ML Verification: {mlResult.status.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.mlConfidenceText}>
                  AI Credibility Score: {(mlResult.confidence * 100).toFixed(1)}%
                </Text>
                <Text style={styles.mlNote}>
                  A verified threat zone has been added to Path Guard routing engine.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* TAB 3: LIVE ACTIVE THREATS */}
        {activeTab === 'threats' && (
          <View style={styles.card}>
            <View style={styles.threatsHeaderRow}>
              <Text style={styles.cardSectionTitle}>Active Verified Threats</Text>
              <TouchableOpacity onPress={loadThreats} style={styles.refreshButton}>
                <Ionicons name="refresh" size={14} color={Theme.colors.primary} />
                <Text style={styles.refreshText}>Refresh</Text>
              </TouchableOpacity>
            </View>

            {threats.length === 0 ? (
              <Text style={styles.emptyText}>No active threats reported in this corridor.</Text>
            ) : (
              threats.map((t) => (
                <View key={t._id} style={styles.threatCard}>
                  <View style={styles.threatHeader}>
                    <View style={styles.threatLevelBadge}>
                      <Text style={styles.threatLevelText}>
                        Level {t.threat_level}/10
                      </Text>
                    </View>
                    <Text style={styles.threatBehavior}>
                      {t.elephant_behavior || 'Wild Activity'}
                    </Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>{t.status}</Text>
                    </View>
                  </View>

                  <Text style={styles.threatDesc}>
                    {t.description || 'Elephant presence logged by sensor / community'}
                  </Text>

                  <View style={styles.threatMetaRow}>
                    <Text style={styles.threatMeta}>
                      📍 {t.location.coordinates[1].toFixed(4)}, {t.location.coordinates[0].toFixed(4)}
                    </Text>
                    <Text style={styles.threatMeta}>
                      Radius: {t.radius_meters || 800}m
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
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
  header: {
    backgroundColor: '#0D2818',
    padding: 16,
    borderRadius: Theme.borderRadius.medium,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A5D6A7',
    letterSpacing: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  headerDesc: {
    fontSize: 12,
    color: '#E8F5E9',
    marginTop: 4,
    lineHeight: 16,
  },
  healthRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  healthBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  healthUp: {
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
    borderWidth: 1,
    borderColor: '#81C784',
  },
  healthDown: {
    backgroundColor: 'rgba(211, 47, 47, 0.3)',
    borderWidth: 1,
    borderColor: '#E57373',
  },
  healthText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 4,
    borderRadius: Theme.borderRadius.medium,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 5,
  },
  tabButtonActive: {
    backgroundColor: Theme.colors.primary,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  tabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 16,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  cardHeaderWithAction: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.colors.text,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    color: Theme.colors.textLight,
    lineHeight: 16,
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginLeft: 8,
  },
  syncBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pickBar: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 10,
  },
  pickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1.5,
    gap: 6,
  },
  pickBtnOrigin: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
  },
  pickBtnActiveOrigin: {
    backgroundColor: '#1565C0',
    borderColor: '#1565C0',
  },
  pickBtnDest: {
    backgroundColor: '#F3E8FF',
    borderColor: '#D8B4FE',
  },
  pickBtnActiveDest: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  pickBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pickActiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  pickActiveOrigin: {
    backgroundColor: '#1565C0',
  },
  pickActiveDest: {
    backgroundColor: '#7C3AED',
  },
  pickActiveBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
    marginLeft: 6,
  },
  inputsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    marginBottom: 6,
  },
  routeSummaryBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  routeSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  routeSummaryTextCol: {
    flex: 1,
  },
  routeSummaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
    flexWrap: 'wrap',
  },
  routeSummarySub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
    marginTop: 2,
  },
  threatAvoidedBadge: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    alignSelf: 'flex-start',
  },
  threatAvoidedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B45309',
  },
  mapContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.large,
    overflow: 'hidden',
    marginBottom: 14,
    ...Theme.shadows.medium,
  },
  mapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
  },
  mapTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  behaviorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  behaviorChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  behaviorChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  behaviorChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  behaviorChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  mlResultCard: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
    borderRadius: Theme.borderRadius.medium,
    padding: 12,
    marginTop: 14,
  },
  mlResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  mlResultTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E20',
    flex: 1,
  },
  mlConfidenceText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2E7D32',
    marginBottom: 4,
  },
  mlNote: {
    fontSize: 11,
    color: '#388E3C',
    lineHeight: 15,
  },
  threatsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  refreshText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.primary,
  },
  threatCard: {
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: Theme.borderRadius.medium,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginBottom: 10,
  },
  threatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  threatLevelBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  threatLevelText: {
    color: '#C62828',
    fontSize: 11,
    fontWeight: '700',
  },
  threatBehavior: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.text,
    flex: 1,
  },
  statusPill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E7D32',
  },
  threatDesc: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    marginBottom: 6,
    lineHeight: 16,
  },
  threatMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  threatMeta: {
    fontSize: 11,
    color: Theme.colors.textLight,
  },
  emptyText: {
    fontSize: 12,
    color: Theme.colors.textLight,
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 14,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: Theme.borderRadius.medium,
    marginBottom: 14,
    gap: 8,
  },
  errorText: {
    color: '#C62828',
    fontSize: 12,
    flex: 1,
  },
});
