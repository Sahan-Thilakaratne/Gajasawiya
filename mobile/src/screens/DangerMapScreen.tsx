import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';
import { fetchDistricts, predictRisk, type PredictResponse, type RiskCell } from '../api';
import { HecMapComponent } from '../components/HecMapComponent';
import { AppButton } from '../components/AppButton';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DangerMapScreen = () => {
  const [districts, setDistricts] = useState<{ id: string; ready: boolean }[]>([]);
  const [district, setDistrict] = useState('Anuradhapura');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [useRain, setUseRain] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PredictResponse | null>(null);
  const [selectedCell, setSelectedCell] = useState<RiskCell | null>(null);

  const [districtModal, setDistrictModal] = useState(false);
  const [monthModal, setMonthModal] = useState(false);

  useEffect(() => {
    fetchDistricts()
      .then((d) => {
        setDistricts(d.districts || []);
        setDistrict(d.default || 'Anuradhapura');
      })
      .catch(() => setDistricts([{ id: 'Anuradhapura', ready: true }]));

    loadData('Anuradhapura', month, useRain);
  }, []);

  const loadData = async (dist: string, m: number, rain: boolean) => {
    try {
      setLoading(true);
      const res = await predictRisk({ district: dist, month: m, use_rainfall: rain, top_n: 800 });
      setData(res);
      if (res.top_cells.length > 0) {
        setSelectedCell(res.top_cells[0]);
      }
    } catch (e) {
      console.warn('Failed to load danger map', e);
    } finally {
      setLoading(false);
    }
  };

  const clim = data?.meta?.climate;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Ionicons name="flame" size={14} color="#FF9800" />
            <Text style={styles.badgeText}>COMPONENT 1 · RISK ENGINE</Text>
          </View>
          <Text style={styles.headerTitle}>District Danger Heatmap</Text>
          <Text style={styles.headerDesc}>
            Calculates overlap risk = Habitat Suitability × Human Exposure with precipitation anomaly weighting.
          </Text>
        </View>

        {/* Controls Card */}
        <View style={styles.controlsCard}>
          <View style={styles.selectorsRow}>
            <View style={styles.selectorCol}>
              <Text style={styles.inputLabel}>Target District</Text>
              <TouchableOpacity style={styles.dropdownButton} onPress={() => setDistrictModal(true)}>
                <Ionicons name="location-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.dropdownText} numberOfLines={1}>{district}</Text>
                <Ionicons name="chevron-down" size={16} color="#8A9E96" />
              </TouchableOpacity>
            </View>

            <View style={styles.selectorCol}>
              <Text style={styles.inputLabel}>Monsoon Month</Text>
              <TouchableOpacity style={styles.dropdownButton} onPress={() => setMonthModal(true)}>
                <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
                <Text style={styles.dropdownText} numberOfLines={1}>{MONTHS[month - 1]}</Text>
                <Ionicons name="chevron-down" size={16} color="#8A9E96" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextGroup}>
              <Text style={styles.switchTitle}>Seasonal Climate & Precipitation</Text>
              <Text style={styles.switchSubtitle}>Factor in historical rainfall anomalies</Text>
            </View>
            <Switch
              value={useRain}
              onValueChange={setUseRain}
              trackColor={{ false: '#CFD8DC', true: '#81C784' }}
              thumbColor={useRain ? Theme.colors.primary : '#FFFFFF'}
            />
          </View>

          <AppButton
            title={loading ? 'Calculating Risk Distribution...' : 'Run Risk Model'}
            icon="analytics-outline"
            onPress={() => loadData(district, month, useRain)}
            loading={loading}
            size="medium"
          />
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>EVALUATED CELLS</Text>
            <Text style={styles.statValue}>{data?.meta?.n_cells ?? '—'}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>AVERAGE RISK</Text>
            <Text style={styles.statValue}>
              {data?.meta?.mean_risk ? data.meta.mean_risk.toFixed(4) : '—'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>PEAK CELL RISK</Text>
            <Text style={[styles.statValue, { color: '#D32F2F' }]}>
              {data?.meta?.max_risk ? data.meta.max_risk.toFixed(3) : '—'}
            </Text>
          </View>
        </View>

        {clim?.rainfall_enabled && (
          <View style={styles.climateCard}>
            <Ionicons name="rainy" size={18} color="#1565C0" />
            <Text style={styles.climateText}>
              {clim.month_key} Precipitation: {clim.mean_precip_mm_day?.toFixed(2)} mm/day · Anomaly{' '}
              {((clim.mean_precip_anomaly ?? 0) * 100).toFixed(0)}%
            </Text>
          </View>
        )}

        {/* Interactive Map */}
        <View style={styles.mapCard}>
          <View style={styles.mapHeader}>
            <Ionicons name="map-outline" size={16} color={Theme.colors.primary} />
            <Text style={styles.mapHeaderTitle}>Grid Risk Concentration</Text>
          </View>
          <HecMapComponent
            cells={data?.top_cells ?? []}
            selectedId={selectedCell?.cell_id ?? null}
            onSelectCell={(id) => {
              const c = data?.top_cells.find((x) => x.cell_id === id);
              if (c) setSelectedCell(c);
            }}
            height={360}
          />
        </View>

        {/* Selected Cell Detail Card */}
        {selectedCell && (
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Ionicons name="locate" size={18} color={Theme.colors.primary} />
              <Text style={styles.detailTitle}>Selected Cell: {selectedCell.cell_id}</Text>
              <View style={styles.riskPill}>
                <Text style={styles.riskPillText}>Risk {selectedCell.risk_score.toFixed(3)}</Text>
              </View>
            </View>
            <Text style={styles.detailExp}>
              {selectedCell.explanation || selectedCell.why || 'High conflict probability area'}
            </Text>
            <View style={styles.detailMetaRow}>
              {selectedCell.habitat_suitability != null && (
                <Text style={styles.detailMeta}>
                  Habitat: {selectedCell.habitat_suitability.toFixed(2)}
                </Text>
              )}
              {selectedCell.human_exposure != null && (
                <Text style={styles.detailMeta}>
                  Exposure: {selectedCell.human_exposure.toFixed(2)}
                </Text>
              )}
              {selectedCell.forest_edge != null && (
                <Text style={styles.detailMeta}>
                  Forest Edge: {selectedCell.forest_edge ? 'Yes' : 'No'}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Top 10 Hotspots List */}
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>Top 10 Conflict Hotspots in {district}</Text>
          {(data?.top_cells ?? []).slice(0, 10).map((c, i) => (
            <TouchableOpacity
              key={c.cell_id}
              style={[
                styles.listItem,
                selectedCell?.cell_id === c.cell_id && styles.activeListItem,
              ]}
              onPress={() => setSelectedCell(c)}
            >
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listCellId}>{c.cell_id}</Text>
                <Text style={styles.listExp} numberOfLines={1}>
                  {c.explanation || c.why || 'High risk agricultural fringe'}
                </Text>
              </View>
              <View style={styles.scoreBadge}>
                <Text style={styles.listRisk}>{c.risk_score.toFixed(3)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* District Modal */}
        <Modal visible={districtModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Target District</Text>
                <TouchableOpacity onPress={() => setDistrictModal(false)}>
                  <Ionicons name="close-circle" size={24} color="#8A9E96" />
                </TouchableOpacity>
              </View>
              {(districts.length ? districts : [{ id: 'Anuradhapura', ready: true }]).map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.modalOption}
                  disabled={!d.ready}
                  onPress={() => {
                    setDistrict(d.id);
                    setDistrictModal(false);
                    loadData(d.id, month, useRain);
                  }}
                >
                  <Ionicons
                    name="location-sharp"
                    size={18}
                    color={district === d.id ? Theme.colors.primary : '#8A9E96'}
                  />
                  <Text style={[styles.modalOptionText, !d.ready && styles.disabledText]}>
                    {d.id} {!d.ready ? '(Coming soon)' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>

        {/* Month Modal */}
        <Modal visible={monthModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Monsoon Month</Text>
                <TouchableOpacity onPress={() => setMonthModal(false)}>
                  <Ionicons name="close-circle" size={24} color="#8A9E96" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 320 }}>
                {MONTHS.map((m, i) => (
                  <TouchableOpacity
                    key={m}
                    style={styles.modalOption}
                    onPress={() => {
                      setMonth(i + 1);
                      setMonthModal(false);
                      loadData(district, i + 1, useRain);
                    }}
                  >
                    <Ionicons
                      name="calendar-sharp"
                      size={18}
                      color={month === i + 1 ? Theme.colors.primary : '#8A9E96'}
                    />
                    <Text style={styles.modalOptionText}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
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
  dropdownButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.medium,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: Theme.colors.surfaceSubtle,
  },
  dropdownText: {
    fontSize: 13,
    fontWeight: '600',
    color: Theme.colors.text,
    flex: 1,
    marginHorizontal: 6,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceSubtle,
    padding: 12,
    borderRadius: Theme.borderRadius.medium,
    marginBottom: 14,
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
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: Theme.borderRadius.medium,
    alignItems: 'center',
    ...Theme.shadows.small,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Theme.colors.textLight,
    textAlign: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: Theme.colors.text,
    marginTop: 4,
  },
  climateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: Theme.borderRadius.medium,
    padding: 12,
    marginBottom: 14,
  },
  climateText: {
    fontSize: 12,
    color: '#1565C0',
    fontWeight: '500',
    flex: 1,
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
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.medium,
    padding: 14,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: Theme.colors.primary,
    ...Theme.shadows.small,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  detailTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.colors.text,
    flex: 1,
  },
  riskPill: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  riskPillText: {
    color: '#D32F2F',
    fontSize: 11,
    fontWeight: '700',
  },
  detailExp: {
    fontSize: 12,
    color: Theme.colors.textSecondary,
    lineHeight: 16,
  },
  detailMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  detailMeta: {
    fontSize: 11,
    color: Theme.colors.textSecondary,
    fontWeight: '600',
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
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  activeListItem: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.colors.textSecondary,
  },
  listCellId: {
    fontSize: 13,
    fontWeight: '700',
    color: Theme.colors.text,
  },
  listExp: {
    fontSize: 11,
    color: Theme.colors.textLight,
  },
  scoreBadge: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  listRisk: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D32F2F',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: Theme.borderRadius.large,
    padding: 18,
    ...Theme.shadows.large,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F0',
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Theme.colors.text,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  modalOptionText: {
    fontSize: 14,
    color: Theme.colors.text,
    fontWeight: '600',
  },
  disabledText: {
    color: '#B0BEC5',
  },
});
