import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Dimensions, FlatList, Image, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Colors, Radius } from '../../utils/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface PhotoCarouselProps {
  uris: string[];
  height?: number;
  radius?: number;
  // When true, tapping a photo opens it full-screen in a swipeable lightbox.
  enableLightbox?: boolean;
}

export default function PhotoCarousel({ uris, height = 220, radius = Radius.md, enableLightbox = false }: PhotoCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index ?? 0);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 75 }).current;

  if (uris.length === 0) return null;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxVisible(true);
  };

  return (
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <FlatList
          data={uris}
          keyExtractor={(uri, i) => `${uri}-${i}`}
          renderItem={({ item, index }) => {
            const image = (
              <Image
                source={{ uri: item }}
                style={{ width, height, borderRadius: radius }}
                resizeMode="cover"
              />
            );
            return enableLightbox ? (
              <TouchableOpacity activeOpacity={0.9} onPress={() => openLightbox(index)}>
                {image}
              </TouchableOpacity>
            ) : image;
          }}
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

      {enableLightbox && (
        <Modal
          visible={lightboxVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLightboxVisible(false)}
        >
          <View style={styles.lightboxContainer}>
            <FlatList
              data={uris}
              keyExtractor={(uri, i) => `lb-${uri}-${i}`}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              initialScrollIndex={lightboxIndex}
              getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
              renderItem={({ item }) => (
                <TouchableOpacity
                  activeOpacity={1}
                  style={styles.lightboxPage}
                  onPress={() => setLightboxVisible(false)}
                >
                  <Image source={{ uri: item }} style={styles.lightboxImage} resizeMode="contain" />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.lightboxClose}
              onPress={() => setLightboxVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </Modal>
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

  lightboxContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  lightboxPage: {
    width: SCREEN_W, height: SCREEN_H,
    justifyContent: 'center', alignItems: 'center',
  },
  lightboxImage: { width: SCREEN_W, height: SCREEN_H * 0.85 },
  lightboxClose: {
    position: 'absolute', top: 50, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
});
