import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../theme';

const { width } = Dimensions.get('window');

interface AnimatedSplashScreenProps {
  onFinish?: () => void;
  minDuration?: number;
}

const STATUS_STEPS = [
  'Connecting to Wildlife Sensor Mesh...',
  'Synchronizing GPS Collar Telemetry...',
  'Loading Regional Danger Maps...',
  'System Armed & Coexistence Active',
];

export const AnimatedSplashScreen: React.FC<AnimatedSplashScreenProps> = ({
  onFinish,
  minDuration = 2400,
}) => {
  const [statusIndex, setStatusIndex] = useState(0);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ring1Scale = useRef(new Animated.Value(0.6)).current;
  const ring1Opacity = useRef(new Animated.Value(0.8)).current;
  const ring2Scale = useRef(new Animated.Value(0.6)).current;
  const ring2Opacity = useRef(new Animated.Value(0.8)).current;
  const ring3Scale = useRef(new Animated.Value(0.6)).current;
  const ring3Opacity = useRef(new Animated.Value(0.8)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const overallFade = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 1. Fade in content
    Animated.timing(contentFade, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // 2. Pulse Logo Loop
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.96,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    // 3. Radar Wave 1
    const wave1 = Animated.loop(
      Animated.parallel([
        Animated.timing(ring1Scale, {
          toValue: 2.4,
          duration: 2200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ring1Opacity, {
          toValue: 0,
          duration: 2200,
          useNativeDriver: true,
        }),
      ])
    );

    // 4. Radar Wave 2 with delay
    const wave2 = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.parallel([
          Animated.timing(ring2Scale, {
            toValue: 2.4,
            duration: 2200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ring2Opacity, {
            toValue: 0,
            duration: 2200,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    // 5. Radar Wave 3 with delay
    const wave3 = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.parallel([
          Animated.timing(ring3Scale, {
            toValue: 2.4,
            duration: 2200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ring3Opacity, {
            toValue: 0,
            duration: 2200,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    wave1.start();
    wave2.start();
    wave3.start();

    // Progress Bar Animation
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: minDuration,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Rotate status steps
    const stepInterval = setInterval(() => {
      setStatusIndex((prev) => (prev < STATUS_STEPS.length - 1 ? prev + 1 : prev));
    }, Math.floor(minDuration / STATUS_STEPS.length));

    // Finish timeout
    const finishTimeout = setTimeout(() => {
      Animated.timing(overallFade, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        pulse.stop();
        wave1.stop();
        wave2.stop();
        wave3.stop();
        onFinish && onFinish();
      });
    }, minDuration);

    return () => {
      clearInterval(stepInterval);
      clearTimeout(finishTimeout);
    };
  }, [minDuration, onFinish]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: overallFade }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0B1D13" />

      {/* Decorative background grid / aura */}
      <View style={styles.aura} />

      <Animated.View style={[styles.centerArea, { opacity: contentFade }]}>
        {/* Sonar Radar Rings */}
        <Animated.View
          style={[
            styles.radarRing,
            {
              transform: [{ scale: ring1Scale }],
              opacity: ring1Opacity,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.radarRing,
            styles.radarRingSecondary,
            {
              transform: [{ scale: ring2Scale }],
              opacity: ring2Opacity,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.radarRing,
            styles.radarRingAmber,
            {
              transform: [{ scale: ring3Scale }],
              opacity: ring3Opacity,
            },
          ]}
        />

        {/* Branded Logo Container */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <Image
            source={require('../../assets/gajasaviya_logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>
      </Animated.View>

      {/* Text & Status Info */}
      <Animated.View style={[styles.bottomArea, { opacity: contentFade }]}>
        <View style={styles.titleContainer}>
          <Text style={styles.brandTitle}>GAJASAVIYA</Text>
          <View style={styles.badgeRow}>
            <Ionicons name="shield-checkmark" size={14} color="#81C784" />
            <Text style={styles.brandSubtitle}>HEC EARLY WARNING & TRACKING</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressBarBackground}>
          <Animated.View style={[styles.progressBarFill, { width: progressWidth }]} />
        </View>

        {/* Dynamic Status Text */}
        <View style={styles.statusRow}>
          <View style={styles.liveDot} />
          <Text style={styles.statusText}>{STATUS_STEPS[statusIndex]}</Text>
        </View>

        <Text style={styles.footerNote}>Sri Lanka Wildlife & Community Protection</Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0B1D13',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 9999,
    paddingVertical: 50,
  },
  aura: {
    position: 'absolute',
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: (width * 1.5) / 2,
    backgroundColor: 'rgba(46, 125, 50, 0.12)',
    top: '20%',
  },
  centerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  radarRing: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
    borderColor: '#4CAF50',
    backgroundColor: 'rgba(76, 175, 80, 0.05)',
  },
  radarRingSecondary: {
    borderColor: '#81C784',
    borderWidth: 1.5,
  },
  radarRingAmber: {
    borderColor: 'rgba(255, 152, 0, 0.6)',
    borderWidth: 1,
  },
  logoContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#2E7D32',
    shadowColor: '#2E7D32',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
    padding: 12,
  },
  logo: {
    width: '90%',
    height: '90%',
  },
  bottomArea: {
    width: '88%',
    alignItems: 'center',
    paddingBottom: 20,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
    color: '#FFFFFF',
    textShadowColor: 'rgba(76, 175, 80, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: '#A5D6A7',
  },
  progressBarBackground: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 14,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00E676',
  },
  statusText: {
    color: '#E0E0E0',
    fontSize: 13,
    fontWeight: '500',
  },
  footerNote: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
