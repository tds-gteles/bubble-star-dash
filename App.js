import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";

const GAME_SECONDS = 60;
const TICK_MS = 50;
const PLAYER_RADIUS = 25;

const colors = {
  sky: "#93E4FF",
  skyDeep: "#4DB6E8",
  meadow: "#8DE073",
  meadowDark: "#45A36D",
  path: "#FFE08A",
  ink: "#19314A",
  softInk: "#426278",
  white: "#FFFFFF",
  bubble: "#BFF6FF",
  bubbleEdge: "#44BFD8",
  yellow: "#FFD84D",
  coral: "#FF7D7D",
  mint: "#B7F5A8",
  lavender: "#CAB7FF",
  peach: "#FFC38E",
  panel: "#F8FDFF"
};

const cloudColors = [colors.lavender, colors.peach, colors.mint, "#FFE9A8", "#C9F0FF"];
const starColors = [colors.yellow, "#FFB84D", "#F7FF7A"];
const wordCategories = [
  {
    id: "colors",
    label: "COLORS",
    title: "Find COLORS",
    color: colors.coral,
    words: ["RED", "BLUE", "GREEN", "PINK", "YELLOW", "PURPLE"],
    decoys: ["BALL", "MOON", "CAKE", "SOCK", "TREE", "CAR"]
  },
  {
    id: "fruit",
    label: "FRUIT",
    title: "Find FRUIT",
    color: colors.peach,
    words: ["APPLE", "PEAR", "MANGO", "GRAPE", "LEMON", "BERRY"],
    decoys: ["CHAIR", "STAR", "SHOE", "BOAT", "CUP", "HAT"]
  },
  {
    id: "shapes",
    label: "SHAPES",
    title: "Find SHAPES",
    color: colors.lavender,
    words: ["CIRCLE", "SQUARE", "STAR", "HEART", "TRIANGLE", "OVAL"],
    decoys: ["MILK", "DOOR", "BED", "BIRD", "BOOK", "FISH"]
  },
  {
    id: "toys",
    label: "TOYS",
    title: "Find TOYS",
    color: colors.mint,
    words: ["BLOCK", "DOLL", "KITE", "PUZZLE", "YOYO", "TRAIN"],
    decoys: ["RAIN", "SOUP", "LEAF", "BREAD", "SUN", "FORK"]
  },
  {
    id: "objects",
    label: "OBJECTS",
    title: "Find OBJECTS",
    color: "#C9F0FF",
    words: ["CUP", "KEY", "BAG", "BOOK", "CLOCK", "LAMP"],
    decoys: ["RED", "HAPPY", "LOUD", "FAST", "ROUND", "SOFT"]
  }
];
const MIXED_CATEGORY_INDEX = -1;
const mixedGameType = {
  id: "mix",
  label: "MIX",
  title: "Mix",
  color: colors.yellow,
  categoryIndex: MIXED_CATEGORY_INDEX
};
const gameTypes = [
  mixedGameType,
  ...wordCategories.map((category, categoryIndex) => ({
    ...category,
    categoryIndex
  }))
];
const LEVEL_COUNT = 30;
const categoryRotation = [0, 1, 2, 3, 4];
const rewardNames = ["Bubble Badge", "Star Pop", "Word Spark", "Rainbow Ring", "Moon Sticker"];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizeBounds(bounds) {
  return {
    width: Math.max(1, bounds.width || 360),
    height: Math.max(1, bounds.height || 640)
  };
}

function chooseWord(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function makeLevelConfig(levelNumber, selectedCategoryIndex = MIXED_CATEGORY_INDEX) {
  const safeLevel = clamp(Math.round(levelNumber) || 1, 1, LEVEL_COUNT);
  const levelIndex = safeLevel - 1;
  const categoryIndex =
    selectedCategoryIndex >= 0
      ? selectedCategoryIndex
      : categoryRotation[levelIndex % categoryRotation.length];

  return {
    levelNumber: safeLevel,
    categoryIndex,
    targetScore: Math.min(26, 5 + Math.floor(levelIndex * 1.15)),
    seconds: Math.max(34, 54 - Math.floor(levelIndex / 4) * 2),
    cloudCap: 4 + Math.min(4, Math.floor(levelIndex / 4)),
    spawnBase: Math.max(0.82, 1.75 - levelIndex * 0.035),
    speedBonus: Math.min(11, levelIndex * 0.55),
    rewardName: rewardNames[levelIndex % rewardNames.length]
  };
}

function getEarnedStars(hearts, timeLeft, duration) {
  let stars = 1;
  if (hearts >= 2) stars += 1;
  if (timeLeft >= duration * 0.3) stars += 1;
  return stars;
}

function resolveCategoryIndex(status, selectedCategoryIndex, levelNumber = 1) {
  if (selectedCategoryIndex >= 0) return selectedCategoryIndex;
  if (status !== "playing") {
    return categoryRotation[(levelNumber - 1) % categoryRotation.length];
  }
  return categoryRotation[(levelNumber - 1) % categoryRotation.length];
}

function getSelectedGameType(selectedCategoryIndex) {
  return gameTypes.find((type) => type.categoryIndex === selectedCategoryIndex) || mixedGameType;
}

function makeCloud(bounds, id, elapsed = 0, category = wordCategories[0], forceMatch = false, speedBonus = 0) {
  const { width, height } = normalizeBounds(bounds);
  const side = Math.floor(Math.random() * 4);
  const padding = 54;
  const isMatch = forceMatch || Math.random() < 0.58;
  let x = Math.random() * width;
  let y = Math.random() * height;

  if (side === 0) y = -padding;
  if (side === 1) x = width + padding;
  if (side === 2) y = height + padding;
  if (side === 3) x = -padding;

  return {
    id,
    x,
    y,
    radius: 20 + Math.random() * 9,
    speed: 17 + Math.random() * 9 + Math.min(8, elapsed * 0.1) + speedBonus,
    wobble: Math.random() * Math.PI * 2,
    color: isMatch ? category.color : cloudColors[Math.floor(Math.random() * cloudColors.length)],
    isMatch,
    word: chooseWord(isMatch ? category.words : category.decoys)
  };
}

function makeStar(x, y, id) {
  return {
    id,
    x,
    y,
    radius: 12,
    spin: Math.random() * 360,
    color: starColors[Math.floor(Math.random() * starColors.length)]
  };
}

function makeBurst(x, y, id, color = colors.white) {
  return {
    id,
    x,
    y,
    radius: 12,
    life: 0.45,
    color
  };
}

function makeBubble(player, target, id, angleOffset = 0) {
  const fallbackAngle = (id * 1.91) % (Math.PI * 2);
  const baseAngle = target ? Math.atan2(target.y - player.y, target.x - player.x) : fallbackAngle;
  const angle = baseAngle + angleOffset;
  const speed = 285;

  return {
    id,
    x: player.x + Math.cos(angle) * 24,
    y: player.y + Math.sin(angle) * 24,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: 15,
    life: 1.65
  };
}

function createGame(bounds, status = "ready", selectedCategoryIndex = MIXED_CATEGORY_INDEX, levelNumber = 1) {
  const safeBounds = normalizeBounds(bounds);
  const level = makeLevelConfig(levelNumber, selectedCategoryIndex);
  const categoryIndex = resolveCategoryIndex(status, selectedCategoryIndex, level.levelNumber);
  const category = wordCategories[categoryIndex];
  const game = {
    status,
    levelNumber: level.levelNumber,
    categoryIndex,
    targetScore: level.targetScore,
    duration: level.seconds,
    cloudCap: level.cloudCap,
    spawnBase: level.spawnBase,
    speedBonus: level.speedBonus,
    rewardName: level.rewardName,
    resultStars: 0,
    elapsed: 0,
    timeLeft: level.seconds,
    hearts: 3,
    score: 0,
    player: {
      x: safeBounds.width / 2,
      y: safeBounds.height * 0.64
    },
    clouds: [],
    bubbles: [],
    stars: [],
    bursts: [],
    spawnTimer: 0.35,
    shootTimer: 0.35,
    invincible: 0,
    nextId: 1
  };

  if (status === "playing") {
    game.clouds = [
      makeCloud(safeBounds, game.nextId++, 0, category, true, level.speedBonus),
      makeCloud(safeBounds, game.nextId++, 0, category, false, level.speedBonus)
    ];
  }

  return game;
}

function advanceGame(prev, bounds) {
  if (prev.status !== "playing") return prev;

  const safeBounds = normalizeBounds(bounds);
  const category = wordCategories[prev.categoryIndex] || wordCategories[0];
  const dt = TICK_MS / 1000;
  const elapsed = prev.elapsed + dt;
  const timeLeft = Math.max(0, prev.timeLeft - dt);
  const player = prev.player;
  let nextId = prev.nextId;
  let score = prev.score;
  let hearts = prev.hearts;
  let invincible = Math.max(0, prev.invincible - dt);
  let spawnTimer = prev.spawnTimer - dt;
  let shootTimer = prev.shootTimer - dt;
  let bursts = prev.bursts
    .map((burst) => ({ ...burst, radius: burst.radius + 54 * dt, life: burst.life - dt }))
    .filter((burst) => burst.life > 0);

  let clouds = prev.clouds.map((cloud) => {
    const dx = player.x - cloud.x;
    const dy = player.y - cloud.y;
    const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const wobble = Math.sin(elapsed * 2.3 + cloud.wobble) * 9;

    return {
      ...cloud,
      x: cloud.x + (dx / length) * cloud.speed * dt + Math.cos(cloud.wobble) * wobble * dt,
      y: cloud.y + (dy / length) * cloud.speed * dt + Math.sin(cloud.wobble) * wobble * dt
    };
  });

  let bubbles = prev.bubbles
    .map((bubble) => ({
      ...bubble,
      x: bubble.x + bubble.vx * dt,
      y: bubble.y + bubble.vy * dt,
      life: bubble.life - dt
    }))
    .filter(
      (bubble) =>
        bubble.life > 0 &&
        bubble.x > -60 &&
        bubble.x < safeBounds.width + 60 &&
        bubble.y > -60 &&
        bubble.y < safeBounds.height + 60
    );

  let stars = prev.stars.map((star) => {
    const pullDistance = distance(player, star);
    if (pullDistance > 120) return star;

    const dx = player.x - star.x;
    const dy = player.y - star.y;
    const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const speed = 120 + (120 - pullDistance) * 2.4;

    return {
      ...star,
      x: star.x + (dx / length) * speed * dt,
      y: star.y + (dy / length) * speed * dt,
      spin: star.spin + 180 * dt
    };
  });

  stars = stars.filter((star) => {
    if (distance(player, star) < PLAYER_RADIUS + star.radius + 8) {
      bursts.push(makeBurst(star.x, star.y, nextId++, colors.yellow));
      return false;
    }
    return true;
  });

  const baseCloudCap = prev.cloudCap || 5;
  const cloudCap = Math.min(9, baseCloudCap + Math.min(2, Math.floor(elapsed / 20)));
  while (spawnTimer <= 0) {
    if (clouds.length < cloudCap) {
      clouds.push(makeCloud(safeBounds, nextId++, elapsed, category, false, prev.speedBonus || 0));
    }
    spawnTimer += Math.max(0.68, (prev.spawnBase || 1.65) - elapsed * 0.004);
  }

  const matchCount = clouds.filter((cloud) => cloud.isMatch).length;
  if (matchCount < 2) {
    const decoyIndex = clouds.findIndex((cloud) => !cloud.isMatch);
    if (decoyIndex >= 0 && clouds.length >= cloudCap) {
      clouds.splice(decoyIndex, 1);
    }
    if (clouds.length < cloudCap + 2) {
      clouds.push(makeCloud(safeBounds, nextId++, elapsed, category, true, prev.speedBonus || 0));
    }
  }

  if (shootTimer <= 0) {
    const targetClouds = clouds.filter((cloud) => cloud.isMatch);
    const aimClouds = targetClouds.length > 0 ? targetClouds : clouds;
    const nearestCloud = aimClouds.reduce((nearest, cloud) => {
      const cloudDistance = distance(player, cloud);
      if (!nearest || cloudDistance < nearest.cloudDistance) {
        return { cloud, cloudDistance };
      }
      return nearest;
    }, null);
    const target = nearestCloud ? nearestCloud.cloud : null;
    const bubbleCount = 1 + Math.min(3, Math.floor((score + prev.levelNumber) / 10));
    const spread =
      bubbleCount === 1
        ? [0]
        : bubbleCount === 2
          ? [-0.18, 0.18]
          : bubbleCount === 3
            ? [-0.28, 0, 0.28]
            : [-0.34, -0.12, 0.12, 0.34];

    spread.forEach((angleOffset) => {
      bubbles.push(makeBubble(player, target, nextId++, angleOffset));
    });
    shootTimer += Math.max(0.36, 0.74 - score * 0.004);
  }

  const hitBubbleIds = new Set();
  const poppedStars = [];
  const remainingClouds = [];

  clouds.forEach((cloud) => {
    const hitBubble = bubbles.find(
      (bubble) => !hitBubbleIds.has(bubble.id) && distance(cloud, bubble) < cloud.radius + bubble.radius
    );

    if (hitBubble && cloud.isMatch) {
      hitBubbleIds.add(hitBubble.id);
      score += 1;
      poppedStars.push(makeStar(cloud.x, cloud.y, nextId++));
      bursts.push(makeBurst(cloud.x, cloud.y, nextId++, cloud.color));
    } else if (hitBubble) {
      hitBubbleIds.add(hitBubble.id);
      remainingClouds.push(cloud);
      bursts.push(makeBurst(hitBubble.x, hitBubble.y, nextId++, colors.white));
    } else {
      remainingClouds.push(cloud);
    }
  });

  clouds = remainingClouds;
  bubbles = bubbles.filter((bubble) => !hitBubbleIds.has(bubble.id));
  stars = stars.concat(poppedStars);

  if (invincible <= 0) {
    let bumped = false;
    clouds = clouds.filter((cloud) => {
      if (!bumped && distance(player, cloud) < PLAYER_RADIUS + cloud.radius * 0.72) {
        bumped = true;
        bursts.push(makeBurst(player.x, player.y, nextId++, colors.coral));
        return false;
      }
      return true;
    });

    if (bumped) {
      hearts = Math.max(0, hearts - 1);
      invincible = 1.25;
    }
  }

  let status = prev.status;
  let resultStars = prev.resultStars || 0;
  if (score >= prev.targetScore) {
    status = "won";
    resultStars = getEarnedStars(hearts, timeLeft, prev.duration || GAME_SECONDS);
  } else if (hearts <= 0 || timeLeft <= 0) {
    status = "rest";
  }

  return {
    ...prev,
    status,
    elapsed,
    timeLeft,
    hearts,
    score,
    player,
    clouds,
    bubbles,
    stars,
    bursts,
    spawnTimer,
    shootTimer,
    invincible,
    resultStars,
    nextId
  };
}

function GameButton({ label, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.gameButton, pressed && styles.gameButtonPressed]}
    >
      <Text style={styles.gameButtonText}>{label}</Text>
    </Pressable>
  );
}

function HeartRow({ hearts }) {
  return (
    <View style={styles.heartRow} accessibilityLabel={`${hearts} hearts`}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={[styles.heart, index >= hearts && styles.heartEmpty]} />
      ))}
    </View>
  );
}

function RewardStars({ count, small = false }) {
  return (
    <View style={[styles.rewardStars, small && styles.rewardStarsSmall]} accessibilityLabel={`${count} reward stars`}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.rewardStar,
            small && styles.rewardStarSmall,
            index >= count && styles.rewardStarEmpty
          ]}
        />
      ))}
    </View>
  );
}

function LevelTrail({ currentLevel, unlockedLevel, levelStars }) {
  const start = clamp(currentLevel - 2, 1, Math.max(1, LEVEL_COUNT - 4));
  const visibleLevels = [0, 1, 2, 3, 4].map((offset) => start + offset).filter((level) => level <= LEVEL_COUNT);

  return (
    <View style={styles.levelTrail}>
      {visibleLevels.map((level) => {
        const locked = level > unlockedLevel;
        const active = level === currentLevel;
        return (
          <View key={level} style={[styles.levelNode, active && styles.levelNodeActive, locked && styles.levelNodeLocked]}>
            <Text style={[styles.levelNodeText, locked && styles.levelNodeTextLocked]}>{level}</Text>
            <RewardStars count={levelStars[level] || 0} small />
          </View>
        );
      })}
    </View>
  );
}

function GameTypePicker({ visible, selectedCategoryIndex, onSelect, onClose }) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={styles.typePanel}>
          <View style={styles.typePanelHeader}>
            <Text style={styles.typePanelTitle}>Game Type</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.typeCloseButton, pressed && styles.pressedButton]}
            >
              <Text style={styles.typeCloseText}>X</Text>
            </Pressable>
          </View>
          <View style={styles.typeGrid}>
            {gameTypes.map((type) => {
              const selected = type.categoryIndex === selectedCategoryIndex;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={type.id}
                  onPress={() => onSelect(type.categoryIndex)}
                  style={({ pressed }) => [
                    styles.typeOption,
                    { borderColor: type.color },
                    selected && styles.typeOptionSelected,
                    pressed && styles.pressedButton
                  ]}
                >
                  <Text adjustsFontSizeToFit numberOfLines={1} style={styles.typeOptionText}>
                    {type.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CloudPuff({ cloud }) {
  const width = Math.max(cloud.radius * 3.4, cloud.word.length * 11 + 30);
  const height = Math.max(cloud.radius * 1.75, 42);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.cloudWrap,
        {
          left: cloud.x - width / 2,
          top: cloud.y - height / 2,
          width,
          height
        }
      ]}
    >
      <View style={[styles.cloudBase, { backgroundColor: cloud.color }]} />
      <View
        style={[
          styles.cloudLobe,
          {
            backgroundColor: cloud.color,
            left: width * 0.07,
            top: height * 0.4,
            width: width * 0.34,
            height: width * 0.34
          }
        ]}
      />
      <View
        style={[
          styles.cloudLobe,
          {
            backgroundColor: cloud.color,
            left: width * 0.3,
            top: height * 0.13,
            width: width * 0.46,
            height: width * 0.46
          }
        ]}
      />
      <View
        style={[
          styles.cloudLobe,
          {
            backgroundColor: cloud.color,
            right: width * 0.08,
            top: height * 0.35,
            width: width * 0.36,
            height: width * 0.36
          }
        ]}
      />
      <View style={[styles.cloudEye, { left: width * 0.39, top: height * 0.58 }]} />
      <View style={[styles.cloudEye, { left: width * 0.57, top: height * 0.58 }]} />
      <View style={[styles.wordBadge, cloud.isMatch && styles.wordBadgeMatch]}>
        <Text adjustsFontSizeToFit minimumFontScale={0.62} numberOfLines={1} style={styles.cloudWord}>
          {cloud.word}
        </Text>
      </View>
    </View>
  );
}

function Bubble({ bubble }) {
  const size = bubble.radius * 2;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.bubble,
        {
          left: bubble.x - bubble.radius,
          top: bubble.y - bubble.radius,
          width: size,
          height: size,
          borderRadius: bubble.radius,
          opacity: clamp(bubble.life / 1.65, 0.28, 1)
        }
      ]}
    >
      <View style={styles.bubbleShine} />
    </View>
  );
}

function StarPickup({ star }) {
  const size = star.radius * 2;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.star,
        {
          left: star.x - star.radius,
          top: star.y - star.radius,
          width: size,
          height: size,
          backgroundColor: star.color,
          transform: [{ rotate: `${45 + star.spin}deg` }]
        }
      ]}
    >
      <View style={styles.starDot} />
    </View>
  );
}

function Burst({ burst }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.burst,
        {
          left: burst.x - burst.radius,
          top: burst.y - burst.radius,
          width: burst.radius * 2,
          height: burst.radius * 2,
          borderRadius: burst.radius,
          borderColor: burst.color,
          opacity: clamp(burst.life / 0.45, 0, 1)
        }
      ]}
    />
  );
}

function Player({ game }) {
  const player = game.player;
  const blink = game.invincible > 0 && Math.floor(game.elapsed * 12) % 2 === 0;

  return (
    <>
      {[0, 1, 2].map((index) => {
        const angle = game.elapsed * 2.8 + index * ((Math.PI * 2) / 3);
        const orbitRadius = 40;
        return (
          <View
            key={index}
            pointerEvents="none"
            style={[
              styles.orbitBubble,
              {
                left: player.x + Math.cos(angle) * orbitRadius - 8,
                top: player.y + Math.sin(angle) * orbitRadius - 8
              }
            ]}
          />
        );
      })}
      <View
        pointerEvents="none"
        style={[
          styles.playerGlow,
          {
            left: player.x - 42,
            top: player.y - 42
          }
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.player,
          blink && styles.playerBlink,
          {
            left: player.x - PLAYER_RADIUS,
            top: player.y - PLAYER_RADIUS
          }
        ]}
      >
        <View style={styles.playerSparkTop} />
        <View style={styles.playerEyeRow}>
          <View style={styles.playerEye} />
          <View style={styles.playerEye} />
        </View>
        <View style={styles.playerSmile} />
      </View>
    </>
  );
}

export default function App() {
  const window = useWindowDimensions();
  const fallbackBounds = useMemo(
    () => ({ width: Math.min(window.width, 520), height: Math.max(500, window.height - 96) }),
    [window.width, window.height]
  );
  const [bounds, setBounds] = useState(fallbackBounds);
  const [currentLevel, setCurrentLevel] = useState(1);
  const [unlockedLevel, setUnlockedLevel] = useState(1);
  const [levelStars, setLevelStars] = useState({});
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(MIXED_CATEGORY_INDEX);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [game, setGame] = useState(() => createGame(fallbackBounds, "ready", MIXED_CATEGORY_INDEX, 1));
  const gameRef = useRef(game);
  const awardedLevelRef = useRef(null);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const timer = setInterval(() => {
      setGame((previousGame) => advanceGame(previousGame, bounds));
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [bounds]);

  useEffect(() => {
    if (gameRef.current.status === "ready") {
      setGame(createGame(bounds, "ready", selectedCategoryIndex, currentLevel));
    }
  }, [bounds, selectedCategoryIndex, currentLevel]);

  useEffect(() => {
    if (game.status !== "won" || awardedLevelRef.current === game.levelNumber) return;

    awardedLevelRef.current = game.levelNumber;
    setUnlockedLevel((previousUnlockedLevel) => Math.max(previousUnlockedLevel, Math.min(LEVEL_COUNT, game.levelNumber + 1)));
    setLevelStars((previousStars) => ({
      ...previousStars,
      [game.levelNumber]: Math.max(previousStars[game.levelNumber] || 0, game.resultStars || 1)
    }));
  }, [game.levelNumber, game.resultStars, game.status]);

  const movePlayerTo = useCallback(
    (x, y) => {
      setGame((previousGame) => {
        if (previousGame.status !== "playing") return previousGame;
        return {
          ...previousGame,
          player: {
            x: clamp(x, PLAYER_RADIUS + 4, bounds.width - PLAYER_RADIUS - 4),
            y: clamp(y, PLAYER_RADIUS + 4, bounds.height - PLAYER_RADIUS - 4)
          }
        };
      });
    },
    [bounds.height, bounds.width]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => gameRef.current.status === "playing",
        onMoveShouldSetPanResponder: () => gameRef.current.status === "playing",
        onPanResponderGrant: (event) => {
          movePlayerTo(event.nativeEvent.locationX, event.nativeEvent.locationY);
        },
        onPanResponderMove: (event) => {
          movePlayerTo(event.nativeEvent.locationX, event.nativeEvent.locationY);
        }
      }),
    [movePlayerTo]
  );

  const beginLevel = useCallback(
    (levelNumber) => {
      const safeLevel = clamp(levelNumber, 1, LEVEL_COUNT);
      awardedLevelRef.current = null;
      setCurrentLevel(safeLevel);
      setGame(createGame(bounds, "playing", selectedCategoryIndex, safeLevel));
    },
    [bounds, selectedCategoryIndex]
  );

  const runOverlayAction = useCallback(() => {
    if (game.status === "won") {
      beginLevel(Math.min(LEVEL_COUNT, game.levelNumber + 1));
    } else {
      beginLevel(currentLevel);
    }
  }, [beginLevel, currentLevel, game.levelNumber, game.status]);

  const chooseGameType = useCallback(
    (categoryIndex) => {
      setSelectedCategoryIndex(categoryIndex);
      setTypePickerOpen(false);
      awardedLevelRef.current = null;
      setGame(createGame(bounds, "ready", categoryIndex, currentLevel));
    },
    [bounds, currentLevel]
  );

  const onStageLayout = useCallback(
    (event) => {
      const nextBounds = normalizeBounds(event.nativeEvent.layout);
      if (Math.abs(nextBounds.width - bounds.width) > 1 || Math.abs(nextBounds.height - bounds.height) > 1) {
        setBounds(nextBounds);
      }
    },
    [bounds.height, bounds.width]
  );

  const progress = clamp(game.score / Math.max(1, game.targetScore), 0, 1);
  const roundedTime = Math.ceil(game.timeLeft);
  const category = wordCategories[game.categoryIndex] || wordCategories[0];
  const selectedGameType = getSelectedGameType(selectedCategoryIndex);
  const overlayVisible = game.status !== "playing";
  const overlayTitle =
    game.status === "won" ? "Level Clear!" : game.status === "rest" ? "Try again" : `Level ${currentLevel}`;
  const overlayCaption =
    game.status === "ready"
      ? `Find ${game.targetScore} words`
      : `${game.score}/${game.targetScore} words found`;
  const overlayButton =
    game.status === "won" ? (game.levelNumber >= LEVEL_COUNT ? "Replay" : "Next") : game.status === "rest" ? "Retry" : "Play";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" backgroundColor={colors.sky} />
      <View style={styles.appFrame}>
        <View style={styles.topBar}>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.kicker}>Bubble Star Dash</Text>
            <Text style={styles.title}>Word Garden</Text>
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>
                LEVEL {currentLevel}  {game.score}/{game.targetScore}  {roundedTime}s
              </Text>
            </View>
          </View>
          <View style={styles.headerControls}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setTypePickerOpen(true)}
              style={({ pressed }) => [
                styles.typeButton,
                { borderColor: selectedGameType.color },
                pressed && styles.pressedButton
              ]}
            >
              <Text style={styles.typeButtonSmall}>TYPE</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={styles.typeButtonText}>
                {selectedGameType.label}
              </Text>
              <Text style={styles.typeButtonArrow}>v</Text>
            </Pressable>
            <HeartRow hearts={game.hearts} />
          </View>
        </View>

        <View style={styles.stage} onLayout={onStageLayout} {...panResponder.panHandlers}>
          <View style={[styles.hill, styles.hillBack]} />
          <View style={[styles.hill, styles.hillFront]} />
          <View style={styles.path} />

          <View style={[styles.categoryPill, { borderColor: category.color }]}>
            <Text adjustsFontSizeToFit numberOfLines={1} style={styles.categoryText}>
              {category.title}
            </Text>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: category.color }]} />
          </View>

          {game.stars.map((star) => (
            <StarPickup key={star.id} star={star} />
          ))}
          {game.clouds.map((cloud) => (
            <CloudPuff key={cloud.id} cloud={cloud} />
          ))}
          {game.bubbles.map((bubble) => (
            <Bubble key={bubble.id} bubble={bubble} />
          ))}
          {game.bursts.map((burst) => (
            <Burst key={burst.id} burst={burst} />
          ))}
          <Player game={game} />

          {overlayVisible && (
            <View style={styles.overlay}>
              <View style={styles.logoMark}>
                <View style={styles.logoBubbleOne} />
                <View style={styles.logoBubbleTwo} />
                <View style={styles.logoFace}>
                  <View style={styles.logoEyeRow}>
                    <View style={styles.logoEye} />
                    <View style={styles.logoEye} />
                  </View>
                  <View style={styles.logoSmile} />
                </View>
              </View>
              <Text style={styles.overlayTitle}>{overlayTitle}</Text>
              <Text style={styles.overlayCaption}>{overlayCaption}</Text>
              {game.status === "won" && (
                <>
                  <RewardStars count={game.resultStars} />
                  <Text style={styles.rewardText}>{game.rewardName}</Text>
                </>
              )}
              <View style={styles.goalCard}>
                <Text style={styles.goalCardLabel}>GOAL</Text>
                <Text style={styles.goalCardText}>
                  {category.label} {game.score}/{game.targetScore}
                </Text>
              </View>
              <LevelTrail currentLevel={currentLevel} levelStars={levelStars} unlockedLevel={unlockedLevel} />
              {game.status !== "ready" && <Text style={styles.overlayTheme}>{category.label}</Text>}
              <GameButton label={overlayButton} onPress={runOverlayAction} />
            </View>
          )}
        </View>
        <GameTypePicker
          onClose={() => setTypePickerOpen(false)}
          onSelect={chooseGameType}
          selectedCategoryIndex={selectedCategoryIndex}
          visible={typePickerOpen}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.sky
  },
  appFrame: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: colors.sky
  },
  topBar: {
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight || 0 : 0,
    paddingHorizontal: 18,
    paddingBottom: 10,
    minHeight: 92,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    backgroundColor: colors.sky
  },
  headerTitleBlock: {
    flexShrink: 1,
    paddingRight: 10
  },
  headerControls: {
    alignItems: "flex-end",
    gap: 7,
    paddingBottom: 2
  },
  kicker: {
    color: colors.softInk,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: 0
  },
  levelBadge: {
    alignSelf: "flex-start",
    marginTop: 4,
    minHeight: 22,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.66)",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  levelBadgeText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0
  },
  typeButton: {
    height: 42,
    minWidth: 122,
    maxWidth: 142,
    borderRadius: 8,
    borderWidth: 3,
    backgroundColor: colors.panel,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8
  },
  typeButtonSmall: {
    color: colors.softInk,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0
  },
  typeButtonText: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0
  },
  typeButtonArrow: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0
  },
  pressedButton: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }]
  },
  heartRow: {
    flexDirection: "row",
    gap: 6,
    paddingBottom: 4
  },
  heart: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.coral,
    borderWidth: 2,
    borderColor: colors.white
  },
  heartEmpty: {
    opacity: 0.25,
    backgroundColor: colors.softInk
  },
  rewardStars: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginBottom: 8
  },
  rewardStarsSmall: {
    gap: 3,
    marginBottom: 0,
    marginTop: 3
  },
  rewardStar: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: colors.yellow,
    borderWidth: 2,
    borderColor: colors.white,
    transform: [{ rotate: "45deg" }]
  },
  rewardStarSmall: {
    width: 8,
    height: 8,
    borderRadius: 2,
    borderWidth: 1
  },
  rewardStarEmpty: {
    opacity: 0.2,
    backgroundColor: colors.softInk
  },
  levelTrail: {
    width: "100%",
    maxWidth: 330,
    marginTop: 8,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "center",
    gap: 7
  },
  levelNode: {
    width: 54,
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.84)",
    backgroundColor: "rgba(255,255,255,0.52)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4
  },
  levelNodeActive: {
    borderColor: colors.yellow,
    backgroundColor: "rgba(255,246,199,0.92)"
  },
  levelNodeLocked: {
    opacity: 0.45
  },
  levelNodeText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0
  },
  levelNodeTextLocked: {
    color: colors.softInk
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(25,49,74,0.34)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20
  },
  typePanel: {
    width: "100%",
    maxWidth: 370,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.white,
    backgroundColor: colors.panel,
    padding: 14
  },
  typePanelHeader: {
    minHeight: 42,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  typePanelTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0
  },
  typeCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.coral,
    alignItems: "center",
    justifyContent: "center"
  },
  typeCloseText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  typeOption: {
    width: "48%",
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 3,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8
  },
  typeOptionSelected: {
    backgroundColor: "#FFF6C7"
  },
  typeOptionText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0
  },
  stage: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: colors.sky,
    borderTopColor: "rgba(255,255,255,0.65)",
    borderTopWidth: 1
  },
  hill: {
    position: "absolute",
    left: "-10%",
    right: "-10%",
    bottom: 0,
    borderTopLeftRadius: 220,
    borderTopRightRadius: 220
  },
  hillBack: {
    height: "34%",
    backgroundColor: colors.meadow,
    bottom: -42,
    opacity: 0.95
  },
  hillFront: {
    height: "25%",
    backgroundColor: colors.meadowDark,
    bottom: -64,
    opacity: 0.92
  },
  path: {
    position: "absolute",
    width: "34%",
    height: "38%",
    left: "33%",
    bottom: -74,
    backgroundColor: colors.path,
    borderTopLeftRadius: 90,
    borderTopRightRadius: 90,
    opacity: 0.88,
    transform: [{ scaleX: 1.25 }]
  },
  hud: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    zIndex: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  scorePill: {
    minWidth: 90,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  scoreStar: {
    width: 16,
    height: 16,
    backgroundColor: colors.yellow,
    transform: [{ rotate: "45deg" }],
    borderRadius: 3
  },
  scoreText: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0
  },
  timePill: {
    minWidth: 54,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center"
  },
  timeText: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0
  },
  progressTrack: {
    position: "absolute",
    top: 112,
    left: 16,
    right: 16,
    height: 8,
    borderRadius: 8,
    overflow: "hidden",
    zIndex: 11,
    backgroundColor: "rgba(255,255,255,0.52)"
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.yellow
  },
  categoryPill: {
    position: "absolute",
    top: 62,
    left: 64,
    right: 64,
    height: 40,
    zIndex: 12,
    borderRadius: 8,
    borderWidth: 3,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  categoryText: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 0
  },
  cloudWrap: {
    position: "absolute",
    zIndex: 4
  },
  cloudBase: {
    position: "absolute",
    left: "8%",
    right: "8%",
    bottom: "9%",
    height: "52%",
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)"
  },
  cloudLobe: {
    position: "absolute",
    borderRadius: 80,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)"
  },
  cloudEye: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.softInk,
    zIndex: 2
  },
  wordBadge: {
    position: "absolute",
    left: 7,
    right: 7,
    top: "38%",
    minHeight: 22,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.72)",
    backgroundColor: "rgba(255,255,255,0.58)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    zIndex: 3
  },
  wordBadgeMatch: {
    backgroundColor: "rgba(255,255,255,0.86)",
    borderColor: colors.yellow
  },
  cloudWord: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0
  },
  bubble: {
    position: "absolute",
    zIndex: 6,
    backgroundColor: "rgba(191,246,255,0.54)",
    borderColor: colors.bubbleEdge,
    borderWidth: 2
  },
  bubbleShine: {
    position: "absolute",
    left: 6,
    top: 5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.82)"
  },
  star: {
    position: "absolute",
    zIndex: 5,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center"
  },
  starDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.white,
    opacity: 0.8
  },
  burst: {
    position: "absolute",
    zIndex: 7,
    borderWidth: 3,
    backgroundColor: "transparent"
  },
  orbitBubble: {
    position: "absolute",
    zIndex: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.45)",
    borderWidth: 2,
    borderColor: "rgba(68,191,216,0.65)"
  },
  playerGlow: {
    position: "absolute",
    zIndex: 2,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,216,77,0.26)"
  },
  player: {
    position: "absolute",
    zIndex: 8,
    width: PLAYER_RADIUS * 2,
    height: PLAYER_RADIUS * 2,
    borderRadius: PLAYER_RADIUS,
    backgroundColor: colors.yellow,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center"
  },
  playerBlink: {
    opacity: 0.55
  },
  playerSparkTop: {
    position: "absolute",
    top: -8,
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: colors.yellow,
    borderWidth: 2,
    borderColor: colors.white,
    transform: [{ rotate: "45deg" }]
  },
  playerEyeRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 5
  },
  playerEye: {
    width: 6,
    height: 7,
    borderRadius: 3,
    backgroundColor: colors.ink
  },
  playerSmile: {
    width: 16,
    height: 8,
    marginTop: 5,
    borderBottomWidth: 3,
    borderBottomColor: colors.ink,
    borderRadius: 10
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 20,
    backgroundColor: "rgba(147,228,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  logoMark: {
    width: 112,
    height: 112,
    marginBottom: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  logoBubbleOne: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "rgba(255,255,255,0.52)",
    borderColor: colors.bubbleEdge,
    borderWidth: 3
  },
  logoBubbleTwo: {
    position: "absolute",
    right: 2,
    top: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderColor: colors.white,
    borderWidth: 3
  },
  logoFace: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.yellow,
    borderColor: colors.white,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center"
  },
  logoEyeRow: {
    flexDirection: "row",
    gap: 10
  },
  logoEye: {
    width: 7,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink
  },
  logoSmile: {
    width: 20,
    height: 9,
    marginTop: 6,
    borderBottomWidth: 3,
    borderBottomColor: colors.ink,
    borderRadius: 10
  },
  overlayTitle: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0
  },
  overlayCaption: {
    color: colors.softInk,
    marginTop: 8,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0
  },
  rewardText: {
    color: colors.ink,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0
  },
  goalCard: {
    minWidth: 156,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: "rgba(255,255,255,0.66)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  goalCardLabel: {
    color: colors.softInk,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0
  },
  goalCardText: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 0
  },
  overlayTheme: {
    minWidth: 104,
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    overflow: "hidden",
    color: colors.ink,
    backgroundColor: "rgba(255,255,255,0.58)",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0
  },
  gameButton: {
    minWidth: 148,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.coral,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.ink,
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  gameButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9
  },
  gameButtonText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0
  }
});
