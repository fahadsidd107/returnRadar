import React, { useEffect } from "react";
import { View, Text, AccessibilityInfo, StyleSheet } from "react-native";
import Svg, { Path, G } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from "react-native-reanimated";
export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      accessibilityLabel="Return Radar parcel return symbol"
    >
      <Path
        d="M101 43A45 45 0 1 1 72 20"
        fill="none"
        stroke="#53E0BA"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <Path
        d="M80 9 101 23 78 34"
        fill="none"
        stroke="#53E0BA"
        strokeWidth="10"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <G stroke="#F7F8F4" strokeWidth="4" strokeLinejoin="round">
        <Path d="m42 55 22-12 22 12v27L64 95 42 82Z" fill="#F7F8F4" />
        <Path d="m42 55 22 13 22-13M64 68v27" fill="none" stroke="#102A43" />
        <Path d="m53 49 22 13" stroke="#102A43" />
      </G>
    </Svg>
  );
}
export function BrandTransition({ onDone,shorten=false }: { onDone: () => void;shorten?:boolean }) {
  const arrow = useSharedValue(0),
    flap = useSharedValue(0),
    word = useSharedValue(0);
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${arrow.value}deg` }],
  }));
  const flapStyle = useAnimatedStyle(() => ({
    transform: [{ perspective:500 },{ rotateX: `${flap.value}deg` }],transformOrigin:[72,62,0],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: word.value,
    transform: [{ translateY: 8 * (1 - word.value) }],
  }));
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!mounted) return;
        if (reduce) {
          word.value = withTiming(1, { duration: 120 });
          timer = setTimeout(onDone, 160);
          return;
        }
        arrow.value = withSequence(
          withTiming(22, { duration: shorten?100:420, easing: Easing.inOut(Easing.cubic) }),
          withTiming(0, { duration: shorten?100:380 }),
        );
        flap.value = withSequence(
          withTiming(-24, { duration: shorten?100:420 }),
          withTiming(0, { duration: shorten?100:380 }),
        );
        word.value = withTiming(1, { duration: shorten?180:600 });
        timer = setTimeout(onDone, shorten?240:1000);
      })
      .catch(onDone);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);
  return (
    <View style={styles.splash}>
      <View style={{ width: 144, height: 144 }}>
        <Animated.View style={[StyleSheet.absoluteFill, arrowStyle]}>
          <Svg viewBox="0 0 128 128" width={144} height={144}>
            <Path
              d="M101 43A45 45 0 1 1 72 20M80 9 101 23 78 34"
              fill="none"
              stroke="#53E0BA"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
        <View style={StyleSheet.absoluteFill}>
          <Svg width={144} height={144} viewBox="0 0 128 128">
            <Path d="m42 55 22 13 22-13v27L64 95 42 82Z" fill="#F7F8F4" />
            <Path d="M64 68v27" stroke="#102A43" strokeWidth={3} />
          </Svg>
        </View>
        <Animated.View style={[StyleSheet.absoluteFill, flapStyle]}>
          <Svg width={144} height={144} viewBox="0 0 128 128">
            <Path
              d="m42 55 22-12 22 12-22 13Z"
              fill="#F7F8F4"
              stroke="#102A43"
              strokeWidth={3}
            />
            <Path d="m53 49 22 13" stroke="#102A43" strokeWidth={3} />
          </Svg>
        </Animated.View>
      </View>
      <Animated.Text style={[styles.word, textStyle]}>
        Return Radar
      </Animated.Text>
      <Text style={styles.tag}>A little organisation. A clear next step.</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: "#102A43",
    alignItems: "center",
    justifyContent: "center",
  },
  word: {
    fontFamily: "Manrope",
    fontSize: 30,
    color: "#F7F8F4",
    marginTop: 24,
  },
  tag: { fontFamily: "Manrope", fontSize: 14, color: "#B8C8D2", marginTop: 12 },
});
