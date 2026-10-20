import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import {
  checkHealth,
  fetchDistricts,
  fetchLocalRoads,
  predictRisk,
  simulateTrack,
  type LocalRoadFeature,
  type LocalRoadsResponse,
  type Playback,
  type PredictResponse,
  type RiskCell,
} from '../api';
import { HecMapComponent } from '../components/HecMapComponent';
import { AppButton } from '../components/AppButton';

import { checkPathGuardHealth, syncComp4Network, postElephantThreat } from '../pathGuardApi';
import { wanderZoneEnvelope } from '../comp4Wander';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const HOURS = [6, 12, 18, 22];

export const HomeScreen = ({ navigation }: any) => {
  const [districts, setDistricts] = useState<{ id: string; ready: boolean }[]>([]);
  const [district, setDistrict] = useState('Anuradhapura');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [useRain, setUseRain] = useState(true);
  const [predict, setPredict] = useState<PredictResponse | null>(null);
  const [selected, setSelected] = useState<RiskCell | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [localRoads, setLocalRoads] = useState<LocalRoadsResponse | null>(null);
  const [selectedRoad, setSelectedRoad] = useState<LocalRoadFeature | null>(null);
  const [routeHour, setRouteHour] = useState(18);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showTrue, setShowTrue] = useState(true);
  const [speedMs, setSpeedMs] = useState(280);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState({ comp1: false, comp2: false, comp3: false, comp4: false });

  // Modal pickers
  const [districtModal, setDistrictModal] = useState(false);
  const [monthModal, setMonthModal] = useState(false);
  const [hotspotModal, setHotspotModal] = useState(false);

  const roadsReq = useRef(0);
  const mode = playback ? 'play' : 'pick';

  useEffect(() => {
    fetchDistricts()
      .then((d) => {
        setDistricts(d.districts || []);
        setDistrict(d.default || 'Anuradhapura');
      })
      .catch(() => setDistricts([{ id: 'Anuradhapura', ready: true }]));

    checkHealth().then((h) => {
      checkPathGuardHealth().then((c4) => {
        setHealth({
          comp1: Boolean(h.comp1?.status === 'ok' || h.comp1?.ok),
          comp2: Boolean(h.comp2?.ok),
          comp3: Boolean(h.comp3?.ok),
          comp4: Boolean(c4.apiUp || c4.mlUp),
        });
      });
    });
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

  const loadLocalRoads = useCallback(
    async (pb: Playback, idx: number, hour: number, showBusy: boolean) => {
      const fr = pb.frames[idx];
      if (!fr?.lon_est || !fr?.lat_est) return;
      const reqId = ++roadsReq.current;
      if (showBusy) setBusy('Calculating road safety corridor...');
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
        if (reqId === roadsReq.current) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (showBusy && reqId === roadsReq.current) setBusy(null);
      }
    },
    []
  );

  const runComp1 = useCallback(async () => {
    setError(null);
    setBusy('Analyzing habitat & rainfall risk...');
    setPlayback(null);
    setLocalRoads(null);
    setSelectedRoad(null);
    setPlaying(false);
    setSelected(null);
    try {
      const res = await predictRisk({
        district,
        month,
        use_rainfall: useRain,
        top_n: 800,
      });
      setPredict(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [district, month, useRain]);

  const runComp2 = useCallback(async () => {
    if (!selected) return;
    setError(null);
    setBusy(`Simulating tracking corridor for ${selected.cell_id}...`);
    setLocalRoads(null);
    setSelectedRoad(null);
    try {
      const pb = await simulateTrack(selected.cell_id);
      setPlayback(pb);
      setFrameIdx(0);
      setPlaying(true);
      await loadLocalRoads(pb, 0, routeHour, true);

      // Auto-sync into Component 4 Path Guard
      if (pb.frames.length > 0) {
        const fr = pb.frames[0];
        if (fr?.lat_est && fr?.lon_est) {
          void syncComp4Network(pb.frames);
          void postElephantThreat({
            latitude: fr.lat_est,
            longitude: fr.lon_est,
            radius_meters: Math.max(fr.uncertainty_radius_m || 500, 400),
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }, [selected, loadLocalRoads, routeHour]);

  // Debounced roads refresh when scrubbing manually
  useEffect(() => {
    if (!playback || playing) return;
    const t = setTimeout(() => {
      void loadLocalRoads(playback, frameIdx, routeHour, false);
    }, 450);
    return () => clearTimeout(t);
  }, [frameIdx, playback, playing, routeHour, loadLocalRoads]);

  const hotList = useMemo(() => {
    if (!predict) return [];
    return [...predict.top_cells]
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 40);
  }, [predict]);

  const handleMapSelectCell = (cellId: string) => {
    if (!predict) return;
    const cell = predict.top_cells.find((c) => c.cell_id === cellId) || null;
    if (cell) {
      setSelected(cell);
      setPlayback(null);
      setLocalRoads(null);
      setSelectedRoad(null);
      setPlaying(false);
    }
  };

  const frame = playback?.frames[frameIdx];
  const clim = predict?.meta?.climate;

  const handleEmergencyCall = () => {
    Linking.openURL('tel:1992').catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top App Bar Header */}
      <View style={styles.appBar}>
        <View style={styles.appBarLeft}>
          <Image
            source={require('../../assets/gajasaviya_logo.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.appBarTitle}>GAJASAVIYA</Text>
            <Text style={styles.appBarSubtitle}>HEC Early Warning Center</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.sosButton}
          onPress={handleEmergencyCall}
          activeOpacity={0.8}
        >
          <Ionicons name="call" size={14} color="#FFFFFF" />
          <Text style={styles.sosButtonText}>1992 SOS</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Model Mesh Status Bar */}
        <View style={styles.meshBar}>
          <View style={styles.meshStatusItem}>
            <View
              style={[
                styles.meshDot,
                health.comp1 ? styles.dotGreen : styles.dotRed,
              ]}
            />
            <Text style={styles.meshText}>Risk Model</Text>
          </View>
          <View style={styles.meshDivider} />
          <View style={styles.meshStatusItem}>
            <View
              style={[
                styles.meshDot,
                health.comp2 ? styles.dotGreen : styles.dotRed,
              ]}
            />
            <Text style={styles.meshText}>EKF Tracker</Text>
          </View>
          <View style={styles.meshDivider} />
          <View style={styles.meshStatusItem}>
            <View
              style={[
                styles.meshDot,
                health.comp3 ? styles.dotGreen : styles.dotRed,
              ]}
            />
            <Text style={styles.meshText}>Road Safety</Text>
          </View>
          <View style={styles.meshDivider} />
          <View style={styles.meshStatusItem}>
            <View
              style={[
                styles.meshDot,
                health.comp4 ? styles.dotGreen : styles.dotRed,
              ]}
            />
            <Text style={styles.meshText}>Path Guard</Text>
          </View>
        </View>

        {/* Dynamic Status Headline Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeaderRow}>
            <View style={styles.statusBadge}>
              <Ionicons
                name={mode === 'play' ? 'radio' : 'map'}
                size={16}
                color={Theme.colors.primary}
              />
              <Text style={styles.statusBadgeText}>
                {mode === 'play' ? 'LIVE TRACKING' : 'REGIONAL MAP'}
              </Text>
            </View>

            {mode === 'play' && frame ? (
              <View
                style={[
                  styles.alertTag,
                  frame.alert ? styles.alertTagRed : styles.alertTagGreen,
                ]}
              >
                <Text style={styles.alertTagText}>
                  {frame.alert ? '🚨 PROXIMITY ALERT' : '✅ CORRIDOR SAFE'}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.statusTitle}>
            {mode === 'play' && frame
              ? `Elephant Wandering at t = ${frame.t_hours.toFixed(1)}h`
              : predict
              ? `${predict.district} District (${predict.top_cells.length} Risk Cells Analyzed)`
              : 'Ready to Run Risk Model'}
          </Text>

          {localRoads && (
            <View style={styles.roadSummaryRow}>
              <View style={styles.roadChipRisky}>
                <Ionicons name="alert-circle" size={14} color="#D32F2F" />
                <Text style={styles.roadChipTextRisky}>
                  Risky Roads: {localRoads.meta.n_risky}
                </Text>
              </View>
              <View style={styles.roadChipSafe}>
                <Ionicons name="checkmark-circle" size={14} color="#2E7D32" />
                <Text style={styles.roadChipTextSafe}>
                  Safe Corridors: {localRoads.meta.n_safe}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Error banner if any */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#D32F2F" />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {/* Local Road Emergency Advice from Comp-3 */}
        {localRoads?.meta?.advice && (
          <View style={styles.adviceCard}>
            <View style={styles.adviceHeader}>
              <Ionicons name="warning" size={20} color="#E65100" />
              <Text style={styles.adviceHeadline}>
                {localRoads.meta.advice.headline}
              </Text>
            </View>
            {localRoads.meta.advice.bullets.map((b, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.adviceBullet}>{b}</Text>
              </View>
            ))}
          </View>
        )}

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

        {/* Interactive Map Component Container */}
        <View style={styles.mapCard}>
          <View style={styles.mapHeaderRow}>
            <View style={styles.mapTitleRow}>
              <Ionicons name="layers-outline" size={16} color={Theme.colors.primary} />
              <Text style={styles.mapCardTitle}>Interactive Tactical Grid</Text>
            </View>
            <Text style={styles.mapModeText}>
              {mode === 'play'
                ? 'Sim active · tap a road for why'
                : 'Tap Dot to Select Hotspot'}
            </Text>
          </View>

          <View style={styles.mapWrapper}>
            <HecMapComponent
              cells={predict?.top_cells ?? []}
              selectedId={selected?.cell_id ?? null}
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
              wanderZone={playback ? wanderZoneEnvelope(playback) : null}
              mode={mode}
              localRoads={localRoads}
              height={380}
            />
          </View>
        </View>

        {/* Telemetry Metrics HUD */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>EST. ERROR</Text>
            <Text style={styles.metricValue}>
              {frame ? `${frame.error_m.toFixed(0)} m` : '—'}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>UNCERTAINTY (2σ)</Text>
            <Text style={styles.metricValue}>
              {frame ? `${frame.uncertainty_radius_m.toFixed(0)} m` : '—'}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>ROAD VULNERABILITY</Text>
            <Text style={styles.metricValue}>
              {localRoads
                ? `${localRoads.meta.n_risky} risky / ${localRoads.meta.n_safe} safe`
                : '—'}
            </Text>
          </View>
        </View>

        {/* Section 1: Comp-1 District Risk Model */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <View>
              <Text style={styles.sectionTitle}>District Risk Model</Text>
              <Text style={styles.sectionSubtitle}>
                AI Habitat Suitability & Rainfall Impact
              </Text>
            </View>
          </View>

          <View style={styles.selectorsRow}>
            <View style={styles.selectorCol}>
              <Text style={styles.inputLabel}>District</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setDistrictModal(true)}
              >
                <Ionicons name="location-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.pickerButtonText} numberOfLines={1}>
                  {district}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#8A9E96" />
              </TouchableOpacity>
            </View>

            <View style={styles.selectorCol}>
              <Text style={styles.inputLabel}>Monsoon Month</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setMonthModal(true)}
              >
                <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.pickerButtonText} numberOfLines={1}>
                  {MONTHS[month - 1]}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#8A9E96" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.switchContainer}>
            <View style={styles.switchLabelGroup}>
              <Text style={styles.switchTitle}>Seasonal Climate & Precipitation</Text>
              <Text style={styles.switchSubtitle}>
                Apply precipitation anomaly weighting to conflict risk
              </Text>
            </View>
            <Switch
              value={useRain}
              onValueChange={setUseRain}
              trackColor={{ false: '#CFD8DC', true: '#81C784' }}
              thumbColor={useRain ? Theme.colors.primary : '#FFFFFF'}
            />
          </View>

          <AppButton
            title={busy?.includes('Analyzing') ? 'Calculating Risk...' : 'Run Risk Assessment'}
            icon="analytics-outline"
            onPress={runComp1}
            loading={Boolean(busy?.includes('Analyzing'))}
            size="medium"
          />

          {clim?.rainfall_enabled && (
            <View style={styles.climateInfoBadge}>
              <Ionicons name="rainy-outline" size={14} color="#1E88E5" />
              <Text style={styles.climateNote}>
                {clim.month_key}: {clim.mean_precip_mm_day?.toFixed(2)} mm/day · anomaly{' '}
                {((clim.mean_precip_anomaly ?? 0) * 100).toFixed(0)}%
              </Text>
            </View>
          )}
        </View>

        {/* Section 2: Hotspot Selection */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <View>
              <Text style={styles.sectionTitle}>Pick Conflict Hotspot</Text>
              <Text style={styles.sectionSubtitle}>
                Select origin cell for elephant path simulation
              </Text>
            </View>
          </View>

          {hotList.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hotspotsScroll}
            >
              {hotList.slice(0, 10).map((cell) => {
                const isSelected = selected?.cell_id === cell.cell_id;
                return (
                  <TouchableOpacity
                    key={cell.cell_id}
                    style={[
                      styles.hotspotCard,
                      isSelected && styles.hotspotCardSelected,
                    ]}
                    onPress={() => setSelected(cell)}
                  >
                    <Text
                      style={[
                        styles.hotspotCardId,
                        isSelected && styles.hotspotCardIdSelected,
                      ]}
                    >
                      {cell.cell_id}
                    </Text>
                    <Text
                      style={[
                        styles.hotspotCardScore,
                        isSelected && styles.hotspotCardScoreSelected,
                      ]}
                    >
                      Risk: {cell.risk_score.toFixed(3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.emptyPrompt}>
              Run Step 1 to generate district hotspots, then pick a cell.
            </Text>
          )}

          {selected && (
            <View style={styles.selectedCellCard}>
              <View style={styles.selectedCellHeader}>
                <Ionicons name="locate" size={18} color={Theme.colors.primary} />
                <Text style={styles.selectedCellTitle}>Selected: {selected.cell_id}</Text>
                <View style={styles.riskBadge}>
                  <Text style={styles.riskBadgeText}>
                    Score {selected.risk_score.toFixed(3)}
                  </Text>
                </View>
              </View>
              <Text style={styles.selectedCellExplanation}>
                {selected.explanation || selected.why || 'High exposure to agriculture & forest fringe.'}
              </Text>
            </View>
          )}
        </View>

        {/* Section 3: EKF Simulation & Telemetry */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>3</Text>
            </View>
            <View>
              <Text style={styles.sectionTitle}>Sparse Tracker & Simulation</Text>
              <Text style={styles.sectionSubtitle}>
                Extended Kalman Filter trajectory propagation
              </Text>
            </View>
          </View>

          <AppButton
            title={
              busy?.includes('Simulating')
                ? 'Simulating Track...'
                : 'Simulate Elephant Movement'
            }
            icon="play-circle-outline"
            onPress={runComp2}
            disabled={!selected || Boolean(busy)}
            loading={Boolean(busy?.includes('Simulating'))}
            size="medium"
          />

          {playback && (
            <View style={styles.playbackDeck}>
              <View style={styles.playControlsRow}>
                <TouchableOpacity
                  style={[styles.deckBtn, playing && styles.deckBtnActive]}
                  onPress={() => setPlaying(true)}
                >
                  <Ionicons
                    name="play"
                    size={16}
                    color={playing ? '#FFFFFF' : Theme.colors.text}
                  />
                  <Text
                    style={[
                      styles.deckBtnText,
                      playing && styles.deckBtnTextActive,
                    ]}
                  >
                    Play
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.deckBtn, !playing && styles.deckBtnActive]}
                  onPress={() => setPlaying(false)}
                >
                  <Ionicons
                    name="pause"
                    size={16}
                    color={!playing ? '#FFFFFF' : Theme.colors.text}
                  />
                  <Text
                    style={[
                      styles.deckBtnText,
                      !playing && styles.deckBtnTextActive,
                    ]}
                  >
                    Pause
                  </Text>
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
                    Frame {frameIdx + 1} of {playback.frames.length}
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

              <View style={styles.switchContainer}>
                <View style={styles.switchLabelGroup}>
                  <Text style={styles.switchTitle}>Show Ground Truth Path</Text>
                  <Text style={styles.switchSubtitle}>
                    Compare simulated GPS ground truth vs sensor estimate
                  </Text>
                </View>
                <Switch
                  value={showTrue}
                  onValueChange={setShowTrue}
                  trackColor={{ false: '#CFD8DC', true: '#81C784' }}
                  thumbColor={showTrue ? Theme.colors.primary : '#FFFFFF'}
                />
              </View>
            </View>
          )}
        </View>

        {/* Section 4: Safe Roads Evaluation */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>4</Text>
            </View>
            <View>
              <Text style={styles.sectionTitle}>Road Safety & Time Window</Text>
              <Text style={styles.sectionSubtitle}>
                Evaluate traffic exposure at different times of day
              </Text>
            </View>
          </View>

          <Text style={styles.inputLabel}>Departure / Travel Hour</Text>
          <View style={styles.hoursRow}>
            {HOURS.map((h) => (
              <TouchableOpacity
                key={h}
                style={[
                  styles.hourChip,
                  routeHour === h && styles.hourChipActive,
                ]}
                onPress={() => setRouteHour(h)}
              >
                <Ionicons
                  name={h >= 18 || h < 6 ? 'moon' : 'sunny'}
                  size={14}
                  color={routeHour === h ? '#FFFFFF' : Theme.colors.textSecondary}
                />
                <Text
                  style={[
                    styles.hourChipText,
                    routeHour === h && styles.hourChipTextActive,
                  ]}
                >
                  {h.toString().padStart(2, '0')}:00
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 5: Comp-4 Path Guard Safe Navigation */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.stepBadge, { backgroundColor: '#1565C0' }]}>
              <Text style={styles.stepBadgeText}>5</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Path Guard AI Dynamic Avoidance</Text>
              <Text style={styles.sectionSubtitle}>
                Dijkstra rerouting bypassing active elephant telemetry zones
              </Text>
            </View>
          </View>

          <View style={styles.pathGuardInfoBox}>
            <Ionicons name="shield-half" size={20} color="#1565C0" />
            <Text style={styles.pathGuardInfoText}>
              Comp-2 elephant position & uncertainty radius are synced into Path Guard (Port 5001/8004) to calculate dynamic safe routes.
            </Text>
          </View>

          <AppButton
            title="Launch Path Guard Navigation"
            icon="navigate-circle-outline"
            onPress={() => navigation.navigate('Path Guard')}
            size="medium"
            type="secondary"
          />
        </View>
      </ScrollView>

      {/* District Picker Modal */}
      <Modal visible={districtModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select District</Text>
              <TouchableOpacity onPress={() => setDistrictModal(false)}>
                <Ionicons name="close-circle" size={24} color="#8A9E96" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {districts.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[
                    styles.modalListItem,
                    district === d.id && styles.modalListItemActive,
                  ]}
                  onPress={() => {
                    setDistrict(d.id);
                    setDistrictModal(false);
                  }}
                >
                  <Ionicons
                    name="location-sharp"
                    size={18}
                    color={district === d.id ? Theme.colors.primary : '#8A9E96'}
                  />
                  <Text
                    style={[
                      styles.modalListText,
                      district === d.id && styles.modalListTextActive,
                    ]}
                  >
                    {d.id}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Month Picker Modal */}
      <Modal visible={monthModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Month</Text>
              <TouchableOpacity onPress={() => setMonthModal(false)}>
                <Ionicons name="close-circle" size={24} color="#8A9E96" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {MONTHS.map((m, idx) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.modalListItem,
                    month === idx + 1 && styles.modalListItemActive,
                  ]}
                  onPress={() => {
                    setMonth(idx + 1);
                    setMonthModal(false);
                  }}
                >
                  <Ionicons
                    name="calendar"
                    size={18}
                    color={month === idx + 1 ? Theme.colors.primary : '#8A9E96'}
                  />
                  <Text
                    style={[
                      styles.modalListText,
                      month === idx + 1 && styles.modalListTextActive,
                    ]}
                  >
                    {m}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0D2818',
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0D2818',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    padding: 3,
  },
  appBarTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  appBarSubtitle: {
    fontSize: 11,
    color: '#A5D6A7',
    fontWeight: '500',
  },
  sosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
    ...Theme.shadows.small,
  },
  sosButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    backgroundColor: Theme.colors.background,
    paddingBottom: 40,
  },
  meshBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Theme.borderRadius.medium,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  meshStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  meshDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dotGreen: {
    backgroundColor: '#00E676',
  },
  dotRed: {
    backgroundColor: '#FF5252',
  },
  meshText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  meshDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#E0E0E0',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 16,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  statusBadgeText: {
    color: Theme.colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  alertTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  alertTagRed: {
    backgroundColor: '#FFEBEE',
  },
  alertTagGreen: {
    backgroundColor: '#E8F5E9',
  },
  alertTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D32F2F',
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Theme.colors.text,
    lineHeight: 21,
  },
  roadSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  roadChipRisky: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  roadChipTextRisky: {
    color: '#C62828',
    fontSize: 12,
    fontWeight: '600',
  },
  roadChipSafe: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  roadChipTextSafe: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: Theme.borderRadius.medium,
    marginBottom: 14,
    gap: 8,
  },
  errorBannerText: {
    color: '#C62828',
    fontSize: 13,
    flex: 1,
  },
  adviceCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: Theme.borderRadius.medium,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FFE082',
    ...Theme.shadows.small,
  },
  adviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  adviceHeadline: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
    flex: 1,
  },
  bulletRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  bulletDot: {
    color: '#E65100',
    fontSize: 14,
    marginRight: 6,
  },
  adviceBullet: {
    fontSize: 12,
    color: '#5D4037',
    flex: 1,
    lineHeight: 17,
  },
  roadExplainCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: Theme.borderRadius.medium,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#90CAF9',
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
  mapCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.large,
    overflow: 'hidden',
    marginBottom: 14,
    ...Theme.shadows.medium,
  },
  mapHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
  },
  mapTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  mapModeText: {
    fontSize: 11,
    color: Theme.colors.textLight,
  },
  mapWrapper: {
    height: 380,
    backgroundColor: '#E0E0E0',
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
    fontSize: 10,
    color: Theme.colors.textLight,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.colors.primary,
    textAlign: 'center',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 16,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: Theme.colors.textLight,
  },
  selectorsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  selectorCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    marginBottom: 6,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.medium,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  pickerButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.colors.text,
    flex: 1,
    marginHorizontal: 6,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Theme.colors.surfaceSubtle,
    padding: 12,
    borderRadius: Theme.borderRadius.medium,
    marginVertical: 10,
  },
  switchLabelGroup: {
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
  climateInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: '#E3F2FD',
    padding: 8,
    borderRadius: 8,
  },
  climateNote: {
    fontSize: 11,
    color: '#1565C0',
    fontWeight: '500',
  },
  hotspotsScroll: {
    gap: 8,
    paddingVertical: 6,
  },
  hotspotCard: {
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.medium,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  hotspotCardSelected: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  hotspotCardId: {
    fontSize: 12,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  hotspotCardIdSelected: {
    color: '#FFFFFF',
  },
  hotspotCardScore: {
    fontSize: 10,
    color: Theme.colors.textLight,
    marginTop: 2,
  },
  hotspotCardScoreSelected: {
    color: '#E8F5E9',
  },
  emptyPrompt: {
    fontSize: 12,
    color: Theme.colors.textLight,
    fontStyle: 'italic',
    marginVertical: 8,
  },
  selectedCellCard: {
    backgroundColor: '#F0F9F2',
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderRadius: Theme.borderRadius.medium,
    padding: 12,
    marginTop: 12,
  },
  selectedCellHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  selectedCellTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.primary,
    flex: 1,
  },
  riskBadge: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  riskBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  selectedCellExplanation: {
    fontSize: 12,
    color: '#2E4C38',
    lineHeight: 16,
  },
  playbackDeck: {
    marginTop: 14,
    backgroundColor: Theme.colors.surfaceSubtle,
    borderRadius: Theme.borderRadius.medium,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  playControlsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  deckBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 5,
  },
  deckBtnActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  deckBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  deckBtnTextActive: {
    color: '#FFFFFF',
  },
  scrubberContainer: {
    marginVertical: 4,
  },
  scrubberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  scrubberLabel: {
    fontSize: 11,
    color: Theme.colors.textSecondary,
    fontWeight: '500',
  },
  scrubberTime: {
    fontSize: 11,
    color: Theme.colors.primary,
    fontWeight: '700',
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 8,
  },
  hourChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  hourChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  hourChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  hourChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.large,
    padding: 18,
    ...Theme.shadows.large,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  modalListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalListItemActive: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  modalListText: {
    fontSize: 14,
    color: Theme.colors.text,
    fontWeight: '500',
  },
  modalListTextActive: {
    color: Theme.colors.primary,
    fontWeight: '700',
  },
  pathGuardInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 10,
    gap: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  pathGuardInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#0D47A1',
    lineHeight: 16,
  },
});
