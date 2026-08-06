import { useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, View } from 'react-native';
import { Colors, Radius } from '../../utils/theme';

interface PhotoCarouselProps {
  uris: string[];
  height?: number;
  radius?: number;
}

export default function PhotoCarousel({ uris, height = 220, radius = Radius.md }: PhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [width, setWidth] = useState(0);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 75 }).current;

  if (uris.length === 0) return null;

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <FlatList
          data={uris}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item }}
              style={{ width, height, borderRadius: radius }}
              resizeMode="cover"
            />
          )}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={width}
          decelerationRate="fast"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />
      )}
      {uris.length > 1 && (
        <View style={styles.dotsRow} pointerEvents="none">
          {uris.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 5, marginTop: 8,
  },
  dot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 14,
    backgroundColor: Colors.accent,
  },
});
