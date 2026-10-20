import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import {
  fetchLocalRoads,
  predictRisk,
  simulateTrack,
  type LocalRoadFeature,
  type LocalRoadsResponse,
  type Playback,
  type RiskCell,
} from '../api';
import { HecMapComponent } from '../components/HecMapComponent';
import { AppButton } from '../components/AppButton';
import { wanderZoneEnvelope } from '../comp4Wander';

const HOURS = [6, 12, 18, 22];

export const TrackerScreen = () => {
  const [cellId, setCellId] = useState('C0052_0088');
  const [hotspots, setHotspots] = useState<RiskCell[]>([]);
  const [loading, setLoading] = useState(false);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [localRoads, setLocalRoads] = useState<LocalRoadsResponse | null>(null);
  const [selectedRoad, setSelectedRoad] = useState<LocalRoadFeature | null>(null);
  const [routeHour, setRouteHour] = useState(18);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showTrue, setShowTrue] = useState(true);
  const [showWander, setShowWander] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [speedMs, setSpeedMs] = useState(280);

  const roadsReq = useRef(0);

  useEffect(() => {
    // Load default top cells for quick selection
    predictRisk({ district: 'Anuradhapura', month: 9, top_n: 25 })
      .then((res) => {
        setHotspots(res.top_cells);
        if (res.top_cells.length > 0) {
          setCellId(res.top_cells[0].cell_id);
        }
      })
      .catch(() => {});
  }, []);

  // Animation player loop
  useEffect(() => {
    if (!playing || !playback) return;
    if (frameIdx >= playback.frames.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setFrameIdx((i) => i + 1), speedMs);
    return () => clearTimeout(t);
  }, [playing, frameIdx, playback, speedMs]);

  const loadRoadsForFrame = useCallback(
    async (pb: Playback, idx: number, hour: number) => {
      const fr = pb.frames[idx];
      if (!fr?.lon_est || !fr?.lat_est) return;
      const reqId = ++roadsReq.current;
      try {
        const path = pb.frames
          .slice(0, idx + 1)
          .filter((f) => f.lon_est != null && f.lat_est != null)
          .filter((_, i, arr) => i % Math.max(1, Math.floor(arr.length / 30)) === 0)
          .map((f) => ({ lon: f.lon_est!, lat: f.lat_est! }));

        const res = await fetchLocalRoads({
          elephant_lon: fr.lon_est,
          elephant_lat: fr.lat_est,
          elephant_radius_m: fr.uncertainty_radius_m || 500,
          hour_of_day: hour,
          buffer_m: 1200,
          path,
        });
        if (reqId === roadsReq.current) {
          setLocalRoads(res);
          setSelectedRoad(null);
        }
      } catch (e) {
        console.warn('Roads fetch failed', e);
      }
    },
    []
  );

  // Debounced roads refresh when scrubbing manually
  useEffect(() => {
    if (!playback || playing) return;
    const t = setTimeout(() => {
      void loadRoadsForFrame(playback, frameIdx, routeHour);
    }, 450);
    return () => clearTimeout(t);
  }, [frameIdx, playback, playing, routeHour, loadRoadsForFrame]);

  const handleSimulate = async (startCell: string) => {
    try {
      setLoading(true);
      setLocalRoads(null);
      setSelectedRoad(null);
      const res = await simulateTrack(startCell);
      setPlayback(res);
      setFrameIdx(0);
      setPlaying(true);

      // Immediately fetch and classify surrounding road network (Red = Risky, Green = Safe)
      await loadRoadsForFrame(res, 0, routeHour);
    } catch (e) {
      console.warn('Simulation failed', e);
    } finally {
      setLoading(false);
    }
  };

  const handleMapSelectCell = (selectedCellId: string) => {
    setCellId(selectedCellId);
    handleSimulate(selectedCellId);
  };

  const frame = playback?.frames[frameIdx];
  const wanderZone = playback && showWander ? wanderZoneEnvelope(playback) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="radio" size={14} color="#81C784" />
            <Text style={styles.badgeText}>COMPONENT 2 · EKF ENGINE</Text>
          </View>
          <Text style={styles.headerTitle}>Sparse Elephant Tracker</Text>
          <Text style={styles.headerDesc}>
            EKF state estimation + Comp-3 road risk classification (Red = Risky Roads, Green = Safe).
          </Text>
        </View>

        {/* Controls Card */}
        <View style={styles.controlsCard}>
          <View style={styles.controlsTitleRow}>
            <Text style={styles.inputLabel}>Starting Conflict Hotspot</Text>
            <Text style={styles.mapTapHint}>💡 Or tap any dot </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hotspotScroll}
          >
            {hotspots.map((h) => {
              const isSelected = cellId === h.cell_id;
              return (
                <TouchableOpacity
                  key={h.cell_id}
                  style={[
                    styles.hotspotPill,
                    isSelected && styles.activeHotspotPill,
                  ]}
                  onPress={() => {
                    setCellId(h.cell_id);
                    handleSimulate(h.cell_id);
                  }}
                >
                  <Ionicons
                    name="locate"
                    size={12}
                    color={isSelected ? '#FFFFFF' : Theme.colors.primary}
                  />
                  <Text
                    style={[
                      styles.hotspotPillText,
                      isSelected && styles.activeHotspotPillText,
                    ]}
                  >
                    {h.cell_id} (Risk {h.risk_score.toFixed(2)})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <AppButton
            title={loading ? 'Propagating EKF State & Roads...' : `Run EKF Simulation from ${cellId}`}
            icon="play-circle-outline"
            onPress={() => handleSimulate(cellId)}
            loading={loading}
            size="medium"
          />
        </View>

        {/* Live Metrics HUD */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>ELAPSED TIME</Text>
            <Text style={styles.metricValue}>
              {frame ? `t = ${frame.t_hours.toFixed(1)} h` : '—'}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>TRACKING ERROR</Text>
            <Text style={[styles.metricValue, { color: Theme.colors.primary }]}>
              {frame ? `${frame.error_m.toFixed(0)} m` : '—'}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>ROAD VULNERABILITY</Text>
            <Text style={[styles.metricValue, { color: '#D32F2F' }]}>
              {localRoads ? `${localRoads.meta.n_risky} Risky` : '—'}
            </Text>
          </View>
        </View>

        {/* Map View with Tap-to-Select Hotspot */}
        <View style={styles.mapCard}>
          <View style={styles.mapHeader}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="navigate-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.mapHeaderTitle}>Interactive Tactical Grid & Trajectory</Text>
              </View>
              <Text style={styles.mapSubHint}>Selected: {cellId} · Tap any hotspot dot on the map to re-simulate</Text>
            </View>
          </View>
          <HecMapComponent
            cells={hotspots}
            selectedId={cellId}
            onSelectCell={handleMapSelectCell}
            selectedRoadId={selectedRoad?.properties.edge_id ?? null}
            onSelectRoad={(edgeId) => {
              const hit =
                localRoads?.features?.find((f) => f.properties.edge_id === edgeId) ??
                null;
              setSelectedRoad(hit);
            }}
            playback={playback}
            frameIdx={frameIdx}
            showTrue={showTrue}
            wanderZone={wanderZone}
            localRoads={showRoads ? localRoads : null}
            mode="play"
            height={380}
          />
        </View>

        {selectedRoad?.properties.explanation && (
          <View style={styles.roadExplainCard}>
            <View style={styles.roadExplainHeader}>
              <Text style={styles.roadExplainTitle}>Why is this road flagged?</Text>
              <TouchableOpacity onPress={() => setSelectedRoad(null)}>
                <Text style={styles.roadExplainClear}>Clear</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.roadExplainName}>
              {selectedRoad.properties.explanation.title}
            </Text>
            <Text style={styles.roadExplainScore}>
              Score {selectedRoad.properties.explanation.segment_risk.toFixed(3)} ·{' '}
              {selectedRoad.properties.explanation.risk_category}
            </Text>
            {selectedRoad.properties.explanation.summary.map((b) => (
              <View key={b} style={styles.bulletRow}>
                <Text style={[styles.bulletDot, { color: '#1565C0' }]}>•</Text>
                <Text style={styles.roadExplainBullet}>{b}</Text>
              </View>
            ))}
            {selectedRoad.properties.explanation.factors.map((f) => (
              <View key={f.id} style={styles.roadFactorItem}>
                <Text style={styles.roadFactorLabel}>{f.label}</Text>
                <Text style={styles.roadFactorValue}>{f.value}</Text>
                {!!f.note && <Text style={styles.roadFactorNote}>{f.note}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* Component 3: Tactical Corridor Safety Advice Card */}
        {localRoads?.meta?.advice && (
          <View style={styles.adviceCard}>
            <View style={styles.adviceHeaderRow}>
              <Ionicons name="shield-checkmark" size={18} color="#1B5E20" />
              <Text style={styles.adviceCardTitle}>Corridor Safety Directives</Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      localRoads.meta.n_risky > 0 ? '#FFEBEE' : '#E8F5E9',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color:
                        localRoads.meta.n_risky > 0 ? '#C62828' : '#2E7D32',
                    },
                  ]}
                >
                  {localRoads.meta.n_risky > 0 ? 'Hazard Warning' : 'Corridor Clear'}
                </Text>
              </View>
            </View>

            <Text style={styles.adviceHeadline}>
              {localRoads.meta.advice.headline}
            </Text>

            {localRoads.meta.advice.bullets &&
              localRoads.meta.advice.bullets.map((b, idx) => (
                <View key={idx} style={styles.bulletRow}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.adviceBulletText}>{b}</Text>
                </View>
              ))}

            <View style={styles.roadStatsRow}>
              <View style={styles.roadStatItem}>
                <Text style={[styles.roadStatNum, { color: '#D32F2F' }]}>
                  {localRoads.meta.n_risky}
                </Text>
                <Text style={styles.roadStatLabel}>High-Risk (Red)</Text>
              </View>
              <View style={styles.roadStatDivider} />
              <View style={styles.roadStatItem}>
                <Text style={[styles.roadStatNum, { color: '#2E7D32' }]}>
                  {localRoads.meta.n_safe}
                </Text>
                <Text style={styles.roadStatLabel}>Safe (Green)</Text>
              </View>
              <View style={styles.roadStatDivider} />
              <View style={styles.roadStatItem}>
                <Text style={styles.roadStatNum}>
                  {localRoads.meta.n_roads}
                </Text>
                <Text style={styles.roadStatLabel}>Total Monitored</Text>
              </View>
            </View>
          </View>
        )}

        {/* Playback Deck */}
        {playback && (
          <View style={styles.playbackCard}>
            <View style={styles.playButtonsRow}>
              <TouchableOpacity
                style={[styles.deckBtn, playing && styles.activeDeckBtn]}
                onPress={() => setPlaying(true)}
              >
                <Ionicons name="play" size={16} color={playing ? '#FFFFFF' : Theme.colors.text} />
                <Text style={[styles.deckBtnText, playing && styles.activeDeckBtnText]}>Play</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.deckBtn, !playing && styles.activeDeckBtn]}
                onPress={() => setPlaying(false)}
              >
                <Ionicons name="pause" size={16} color={!playing ? '#FFFFFF' : Theme.colors.text} />
                <Text style={[styles.deckBtnText, !playing && styles.activeDeckBtnText]}>Pause</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deckBtn}
                onPress={() => {
                  setPlaying(false);
                  setFrameIdx(0);
                }}
              >
                <Ionicons name="refresh" size={16} color={Theme.colors.text} />
                <Text style={styles.deckBtnText}>Reset</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.scrubberContainer}>
              <View style={styles.scrubberHeader}>
                <Text style={styles.scrubberLabel}>
                  Scrub Frame {frameIdx + 1} of {playback.frames.length}
                </Text>
                <Text style={styles.scrubberTime}>
                  t = {(frame?.t_hours ?? 0).toFixed(1)} hrs
                </Text>
              </View>
              <Slider
                style={{ width: '100%', height: 36 }}
                minimumValue={0}
                maximumValue={Math.max((playback.frames.length || 1) - 1, 0)}
                value={frameIdx}
                step={1}
                minimumTrackTintColor={Theme.colors.primary}
                maximumTrackTintColor="#CFD8DC"
                thumbTintColor={Theme.colors.primary}
                onValueChange={(val) => {
                  setPlaying(false);
                  setFrameIdx(Math.round(val));
                }}
              />
            </View>

            {/* Travel Hour Selector */}
            <View style={styles.hourSelectorRow}>
              <Text style={styles.hourSelectorLabel}>Patrol / Travel Hour:</Text>
              <View style={styles.hoursChipContainer}>
                {HOURS.map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[
                      styles.smallHourChip,
                      routeHour === h && styles.smallHourChipActive,
                    ]}
                    onPress={() => setRouteHour(h)}
                  >
                    <Text
                      style={[
                        styles.smallHourChipText,
                        routeHour === h && styles.smallHourChipTextActive,
                      ]}
                    >
                      {h}:00
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchTextGroup}>
                <Text style={styles.switchTitle}>Show Ground Truth Actual Path</Text>
                <Text style={styles.switchSubtitle}>Display underlying true simulated trajectory</Text>
              </View>
              <Switch
                value={showTrue}
                onValueChange={setShowTrue}
                trackColor={{ false: '#CFD8DC', true: '#81C784' }}
                thumbColor={showTrue ? Theme.colors.primary : '#FFFFFF'}
              />
            </View>

            <View style={[styles.switchRow, { marginTop: 8 }]}>
              <View style={styles.switchTextGroup}>
                <Text style={styles.switchTitle}>Show Red Hazard Road Network (Comp-3)</Text>
                <Text style={styles.switchSubtitle}>
                  {localRoads ? `${localRoads.meta.n_risky} risky (Red) · ${localRoads.meta.n_safe} safe (Green)` : 'Classification of road corridors'}
                </Text>
              </View>
              <Switch
                value={showRoads}
                onValueChange={setShowRoads}
                trackColor={{ false: '#CFD8DC', true: '#81C784' }}
                thumbColor={showRoads ? Theme.colors.primary : '#FFFFFF'}
              />
            </View>

            <View style={[styles.switchRow, { marginTop: 8 }]}>
              <View style={styles.switchTextGroup}>
                <Text style={styles.switchTitle}>Show Elephant Wander Patrol Zone</Text>
                <Text style={styles.switchSubtitle}>
                  Corridor envelope radius: {wanderZone ? (wanderZone.radiusM / 1000).toFixed(1) + ' km' : '—'}
                </Text>
              </View>
              <Switch
                value={showWander}
                onValueChange={setShowWander}
                trackColor={{ false: '#CFD8DC', true: '#81C784' }}
                thumbColor={showWander ? Theme.colors.primary : '#FFFFFF'}
              />
            </View>
          </View>
        )}

        {/* Honesty Note */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle-outline" size={16} color="#556B64" />
          <Text style={styles.disclaimerText}>
            {playback?.disclaimer ||
              'Telemetry Model: Movebank Kruger bio-logging dynamics calibrated to Sri Lankan terrain.'}
          </Text>
        </View>
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
  controlsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 16,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  controlsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.textSecondary,
  },
  mapTapHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2E7D32',
  },
  mapSubHint: {
    fontSize: 11,
    color: Theme.colors.textLight,
    marginTop: 2,
  },
  hotspotScroll: {
    gap: 8,
    paddingVertical: 4,
    marginBottom: 12,
  },
  hotspotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  activeHotspotPill: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  hotspotPillText: {
    fontSize: 12,
    color: Theme.colors.text,
    fontWeight: '600',
  },
  activeHotspotPillText: {
    color: '#FFFFFF',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: Theme.borderRadius.medium,
    alignItems: 'center',
    ...Theme.shadows.small,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.colors.textLight,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.colors.text,
    marginTop: 4,
  },
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.large,
    overflow: 'hidden',
    marginBottom: 14,
    ...Theme.shadows.medium,
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
  },
  mapHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  playbackCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 16,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  playButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  deckBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    backgroundColor: Theme.colors.surfaceSubtle,
  },
  activeDeckBtn: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  deckBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  activeDeckBtnText: {
    color: '#FFFFFF',
  },
  scrubberContainer: {
    marginVertical: 6,
  },
  scrubberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  scrubberLabel: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    fontWeight: '500',
  },
  scrubberTime: {
    fontSize: 12,
    color: Theme.colors.primary,
    fontWeight: '700',
  },
  hourSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#EEF2F0',
  },
  hourSelectorLabel: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    fontWeight: '600',
  },
  hoursChipContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  smallHourChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  smallHourChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  smallHourChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  smallHourChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceSubtle,
    padding: 12,
    borderRadius: Theme.borderRadius.medium,
    marginTop: 6,
  },
  switchTextGroup: {
    flex: 1,
    paddingRight: 8,
  },
  switchTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  switchSubtitle: {
    fontSize: 11,
    color: Theme.colors.textLight,
    marginTop: 2,
  },
  roadExplainCard: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
    borderWidth: 1,
    borderRadius: Theme.borderRadius.medium,
    padding: 14,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  roadExplainHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  roadExplainTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D47A1',
  },
  roadExplainClear: {
    fontSize: 12,
    color: '#1565C0',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  roadExplainName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D47A1',
  },
  roadExplainScore: {
    fontSize: 12,
    color: '#1565C0',
    marginTop: 4,
    marginBottom: 4,
  },
  roadExplainBullet: {
    fontSize: 12,
    color: '#1565C0',
    flex: 1,
    lineHeight: 16,
  },
  roadFactorItem: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#BBDEFB',
    paddingTop: 6,
  },
  roadFactorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D47A1',
  },
  roadFactorValue: {
    fontSize: 12,
    color: '#1565C0',
  },
  roadFactorNote: {
    fontSize: 11,
    color: '#1976D2',
    opacity: 0.85,
  },
  adviceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 16,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  adviceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  adviceCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1B5E20',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  adviceHeadline: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.text,
    marginBottom: 8,
    lineHeight: 18,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 4,
  },
  bulletDot: {
    fontSize: 14,
    color: '#1B5E20',
    lineHeight: 18,
  },
  adviceBulletText: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  roadStatsRow: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  roadStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  roadStatNum: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  roadStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.colors.textLight,
    marginTop: 2,
    textAlign: 'center',
  },
  roadStatDivider: {
    width: 1,
    backgroundColor: Theme.colors.border,
    marginVertical: 2,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF4F0',
    padding: 12,
    borderRadius: Theme.borderRadius.medium,
    marginTop: 4,
  },
  disclaimerText: {
    fontSize: 11,
    color: Theme.colors.textSecondary,
    lineHeight: 16,
    flex: 1,
  },
});
