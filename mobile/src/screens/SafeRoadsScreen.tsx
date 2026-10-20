import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import {
  fetchLocalRoads,
  type LocalRoadFeature,
  type LocalRoadsResponse,
} from '../api';
import { HecMapComponent } from '../components/HecMapComponent';
import { AppButton } from '../components/AppButton';

const HOURS = [6, 12, 18, 22];

export const SafeRoadsScreen = () => {
  const [lat, setLat] = useState(8.3114);
  const [lon, setLon] = useState(80.4037);
  const [radiusM, setRadiusM] = useState(1200);
  const [hour, setHour] = useState(18);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LocalRoadsResponse | null>(null);
  const [selectedRoad, setSelectedRoad] = useState<LocalRoadFeature | null>(null);

  useEffect(() => {
    handleFetchRoads(lat, lon, radiusM, hour);
  }, []);

  const handleFetchRoads = async (eLat: number, eLon: number, eRad: number, h: number) => {
    try {
      setLoading(true);
      const res = await fetchLocalRoads({
        elephant_lat: eLat,
        elephant_lon: eLon,
        elephant_radius_m: eRad,
        hour_of_day: h,
        buffer_m: 1500,
      });
      setData(res);
      setSelectedRoad(null);
    } catch (e) {
      console.warn('Failed to fetch safe roads', e);
    } finally {
      setLoading(false);
    }
  };

  const selectRoadById = (edgeId: string) => {
    const hit = data?.features?.find((f) => f.properties.edge_id === edgeId) ?? null;
    setSelectedRoad(hit);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="shield-checkmark" size={14} color="#81C784" />
            <Text style={styles.badgeText}>COMPONENT 3 · SAFE PASSAGE</Text>
          </View>
          <Text style={styles.headerTitle}>Safe Road Routing & Hazards</Text>
          <Text style={styles.headerDesc}>
            Corridor ML risk-scoring near the elephant. Tap a road on the map or
            list for a “why flagged?” explanation.
          </Text>
        </View>

        {/* Controls Card */}
        <View style={styles.controlsCard}>
          <Text style={styles.inputLabel}>Select Travel / Patrol Hour</Text>
          <View style={styles.hoursRow}>
            {HOURS.map((h) => {
              const isSelected = hour === h;
              return (
                <TouchableOpacity
                  key={h}
                  style={[
                    styles.hourChip,
                    isSelected && styles.hourChipActive,
                  ]}
                  onPress={() => {
                    setHour(h);
                    handleFetchRoads(lat, lon, radiusM, h);
                  }}
                >
                  <Ionicons
                    name={h >= 18 || h < 6 ? 'moon' : 'sunny'}
                    size={14}
                    color={isSelected ? '#FFFFFF' : Theme.colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.hourChipText,
                      isSelected && styles.hourChipTextActive,
                    ]}
                  >
                    {h.toString().padStart(2, '0')}:00
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <AppButton
            title={loading ? 'Evaluating Road Vulnerability...' : 'Analyze Nearby Road Network'}
            icon="analytics-outline"
            onPress={() => handleFetchRoads(lat, lon, radiusM, hour)}
            loading={loading}
            size="medium"
            style={{ marginTop: 8 }}
          />
        </View>

        {/* Stats Grid */}
        <View style={styles.metricsGrid}>
          <View style={[styles.metricCard, styles.cardRisky]}>
            <Text style={styles.metricLabel}>RISKY ROADS</Text>
            <Text style={[styles.metricValue, { color: '#C62828' }]}>
              {data?.meta?.n_risky ?? '—'}
            </Text>
          </View>
          <View style={[styles.metricCard, styles.cardSafe]}>
            <Text style={styles.metricLabel}>SAFE BYPASSES</Text>
            <Text style={[styles.metricValue, { color: '#2E7D32' }]}>
              {data?.meta?.n_safe ?? '—'}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>TOTAL NETWORK</Text>
            <Text style={styles.metricValue}>{data?.meta?.n_roads ?? '—'}</Text>
          </View>
        </View>

        {/* Advice / Warning Card */}
        {data?.meta?.advice && (
          <View style={styles.adviceCard}>
            <View style={styles.adviceHeader}>
              <Ionicons name="warning" size={20} color="#E65100" />
              <Text style={styles.adviceHeadline}>{data.meta.advice.headline}</Text>
            </View>
            {data.meta.advice.bullets.map((b, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.adviceBullet}>{b}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Why is this road flagged? */}
        {selectedRoad?.properties.explanation && (
          <View style={styles.explainCard}>
            <View style={styles.explainHeader}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="information-circle" size={20} color="#1565C0" />
                <Text style={styles.explainTitle}>Why is this road flagged?</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedRoad(null)}>
                <Text style={styles.clearLink}>Clear</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.explainRoadName}>
              {selectedRoad.properties.explanation.title}
            </Text>
            <Text style={styles.explainScore}>
              Score {selectedRoad.properties.explanation.segment_risk.toFixed(3)} ·{' '}
              {selectedRoad.properties.explanation.risk_category}
            </Text>
            {selectedRoad.properties.explanation.summary.map((b) => (
              <View key={b} style={styles.bulletRow}>
                <Text style={[styles.bulletDot, { color: '#1565C0' }]}>•</Text>
                <Text style={styles.explainBullet}>{b}</Text>
              </View>
            ))}
            <View style={styles.factorBlock}>
              {selectedRoad.properties.explanation.factors.map((f) => (
                <View key={f.id} style={styles.factorItem}>
                  <Text style={styles.factorLabel}>{f.label}</Text>
                  <Text style={styles.factorValue}>{f.value}</Text>
                  {!!f.note && <Text style={styles.factorNote}>{f.note}</Text>}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Map View */}
        <View style={styles.mapCard}>
          <View style={styles.mapHeader}>
            <Ionicons name="car-outline" size={16} color={Theme.colors.primary} />
            <Text style={styles.mapHeaderTitle}>Road Segments & Elephant Proximity Buffer</Text>
          </View>
          <HecMapComponent
            localRoads={data}
            selectedRoadId={selectedRoad?.properties.edge_id ?? null}
            onSelectRoad={selectRoadById}
            mode="pick"
            height={380}
          />
        </View>

        {/* Road List Breakdown */}
        {data?.features && data.features.length > 0 && (
          <View style={styles.listCard}>
            <Text style={styles.listTitle}>Road Segment Classifications</Text>
            {data.features.slice(0, 12).map((f) => {
              const isRisky = f.properties.risk_class === 'risky';
              const isSel = selectedRoad?.properties.edge_id === f.properties.edge_id;
              return (
                <TouchableOpacity
                  key={f.properties.edge_id}
                  style={[styles.roadItem, isSel && styles.roadItemSelected]}
                  onPress={() => setSelectedRoad(f)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.roadColorBar,
                      { backgroundColor: isSel ? '#1D4ED8' : isRisky ? '#D32F2F' : '#2E7D32' },
                    ]}
                  />
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.roadName} numberOfLines={1} ellipsizeMode="tail">
                      {f.properties.name || (isRisky ? 'High-Risk Forest Road' : 'Community Bypass')}
                    </Text>
                    <Text style={styles.roadMeta} numberOfLines={1} ellipsizeMode="tail">
                      {f.properties.highway ? `Type: ${f.properties.highway} · ` : ''}
                      Length: {f.properties.length_m ? `${f.properties.length_m.toFixed(0)}m` : '—'}
                      {' · tap why'}
                    </Text>
                  </View>
                  <View style={[styles.riskTag, isRisky ? styles.riskyTag : styles.safeTag]}>
                    <Text style={[styles.riskTagText, isRisky ? styles.riskyTagText : styles.safeTagText]}>
                      {isRisky ? 'RISK' : 'SAFE'} {f.properties.segment_risk.toFixed(2)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
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
  controlsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 16,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
    marginBottom: 8,
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  hourChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.medium,
    gap: 5,
  },
  hourChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  hourChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.colors.textSecondary,
  },
  hourChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
  cardRisky: {
    borderTopWidth: 3,
    borderTopColor: '#D32F2F',
  },
  cardSafe: {
    borderTopWidth: 3,
    borderTopColor: '#2E7D32',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.colors.textLight,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.colors.text,
    marginTop: 4,
  },
  adviceCard: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FFE082',
    borderWidth: 1,
    borderRadius: Theme.borderRadius.medium,
    padding: 14,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  adviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
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
    lineHeight: 16,
  },
  explainCard: {
    backgroundColor: '#E3F2FD',
    borderColor: '#90CAF9',
    borderWidth: 1,
    borderRadius: Theme.borderRadius.medium,
    padding: 14,
    marginBottom: 14,
    ...Theme.shadows.small,
  },
  explainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  explainTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D47A1',
    flex: 1,
  },
  clearLink: {
    fontSize: 12,
    color: '#1565C0',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  explainRoadName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D47A1',
  },
  explainScore: {
    fontSize: 12,
    color: '#1565C0',
    marginTop: 4,
    marginBottom: 6,
  },
  explainBullet: {
    fontSize: 12,
    color: '#1565C0',
    flex: 1,
    lineHeight: 16,
  },
  factorBlock: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#BBDEFB',
    paddingTop: 8,
    gap: 8,
  },
  factorItem: {
    marginBottom: 2,
  },
  factorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D47A1',
  },
  factorValue: {
    fontSize: 12,
    color: '#1565C0',
  },
  factorNote: {
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
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 16,
    ...Theme.shadows.small,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Theme.colors.text,
    marginBottom: 12,
  },
  roadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  roadItemSelected: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  roadColorBar: {
    width: 5,
    height: 34,
    borderRadius: 3,
  },
  roadName: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.colors.text,
  },
  roadMeta: {
    fontSize: 11,
    color: Theme.colors.textLight,
    marginTop: 2,
  },
  riskTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  riskyTag: {
    backgroundColor: '#FFEBEE',
  },
  safeTag: {
    backgroundColor: '#E8F5E9',
  },
  riskTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  riskyTagText: {
    color: '#C62828',
  },
  safeTagText: {
    color: '#2E7D32',
  },
});
