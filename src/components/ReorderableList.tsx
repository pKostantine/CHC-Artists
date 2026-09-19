import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { COLORS } from '@/constants/theme';

type Layout = { y: number; height: number };
type DragState = { from: number; dy: number };

interface DragHandlers {
  start: (index: number) => void;
  move: (dy: number) => void;
  end: () => void;
}

export interface ReorderDragHandleProps {
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
  active: boolean;
  disabled: boolean;
  accessibilityLabel: string;
}

export function SixDotDragHandle({
  panHandlers,
  active,
  disabled,
  accessibilityLabel,
}: ReorderDragHandleProps) {
  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      {...(!disabled ? panHandlers : {})}
      style={[
        styles.handle,
        Platform.OS === 'web' && !disabled && styles.handleWeb,
        active && styles.handleActive,
        disabled && styles.handleDisabled,
      ]}
    >
      <View style={styles.dots}>
        {Array.from({ length: 6 }, (_, index) => (
          <View key={index} style={[styles.dot, active && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

function ReorderableRow<Item>({
  item,
  index,
  offset,
  lifted,
  dragging,
  disabled,
  handlers,
  onLayout,
  renderItem,
}: {
  item: Item;
  index: number;
  offset: number;
  lifted: boolean;
  dragging: boolean;
  disabled: boolean;
  handlers: MutableRefObject<DragHandlers>;
  onLayout: (index: number, layout: Layout) => void;
  renderItem: (item: Item, index: number, dragHandle: ReactNode, dragging: boolean) => ReactNode;
}) {
  const [translateY] = useState(() => new Animated.Value(0));
  const indexRef = useRef(index);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    if (lifted || !dragging) {
      translateY.setValue(offset);
      return;
    }

    Animated.timing(translateY, {
      toValue: offset,
      duration: 140,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [dragging, lifted, offset, translateY]);

  // Same responder architecture as CHC's music queue: create the responder
  // once and call through a ref so moving state never rebuilds the gesture.
  const [responder] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => handlers.current.start(indexRef.current),
    onPanResponderMove: (_event: GestureResponderEvent, gesture: PanResponderGestureState) => {
      handlers.current.move(gesture.dy);
    },
    onPanResponderRelease: () => handlers.current.end(),
    onPanResponderTerminate: () => handlers.current.end(),
  }));

  const dragHandle = (
    <SixDotDragHandle
      panHandlers={responder.panHandlers}
      active={lifted}
      disabled={disabled}
      accessibilityLabel={`Drag item ${index + 1} to reorder`}
    />
  );

  return (
    <Animated.View
      onLayout={(event) => onLayout(index, {
        y: event.nativeEvent.layout.y,
        height: event.nativeEvent.layout.height,
      })}
      style={[
        { transform: [{ translateY }] },
        lifted && styles.lifted,
      ]}
    >
      {renderItem(item, index, dragHandle, dragging)}
    </Animated.View>
  );
}

export function ReorderableList<Item>({
  items,
  getKey,
  onMove,
  renderItem,
  onDragActiveChange,
  disabled = false,
  gap = 8,
  style,
}: {
  items: Item[];
  getKey: (item: Item, index: number) => string;
  onMove: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: Item, index: number, dragHandle: ReactNode, dragging: boolean) => ReactNode;
  onDragActiveChange?: (active: boolean) => void;
  disabled?: boolean;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const layouts = useRef<Record<number, Layout>>({});
  const [drag, setDrag] = useState<DragState | null>(null);

  const target = useMemo(() => {
    if (!drag) return -1;
    const source = layouts.current[drag.from];
    if (!source) return drag.from;

    const draggedCenter = source.y + source.height / 2 + drag.dy;
    let bestIndex = drag.from;
    let bestDistance = Number.POSITIVE_INFINITY;

    items.forEach((_item, index) => {
      const layout = layouts.current[index];
      if (!layout) return;
      const distance = Math.abs(draggedCenter - (layout.y + layout.height / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }, [drag, items]);

  const handlers = useRef<DragHandlers>({
    start: () => undefined,
    move: () => undefined,
    end: () => undefined,
  });

  useEffect(() => {
    handlers.current = {
      start: (index) => {
        if (disabled) return;
        setDrag({ from: index, dy: 0 });
        onDragActiveChange?.(true);
      },
      move: (dy) => setDrag((current) => current ? { ...current, dy } : current),
      end: () => {
        if (drag && target >= 0 && target !== drag.from) {
          onMove(drag.from, target);
        }
        setDrag(null);
        layouts.current = {};
        onDragActiveChange?.(false);
      },
    };
  }, [disabled, drag, onDragActiveChange, onMove, target]);

  const sourceHeight = drag ? (layouts.current[drag.from]?.height ?? 0) : 0;
  const offsetFor = (index: number) => {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    const shift = sourceHeight + gap;
    if (drag.from < index && index <= target) return -shift;
    if (target <= index && index < drag.from) return shift;
    return 0;
  };

  return (
    <View style={[styles.list, { gap }, style]}>
      {items.map((item, index) => (
        <ReorderableRow
          key={getKey(item, index)}
          item={item}
          index={index}
          offset={offsetFor(index)}
          lifted={drag?.from === index}
          dragging={drag !== null}
          disabled={disabled}
          handlers={handlers}
          onLayout={(rowIndex, layout) => { layouts.current[rowIndex] = layout; }}
          renderItem={renderItem}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { position: 'relative' },
  lifted: {
    zIndex: 100,
    elevation: 12,
    ...Platform.select({
      web: { filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.45))' } as object,
      default: {},
    }),
  },
  handle: {
    width: 42,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  handleWeb: { cursor: 'grab', touchAction: 'none', userSelect: 'none' } as object,
  handleActive: { backgroundColor: 'rgba(212, 175, 55, 0.10)' },
  handleDisabled: { opacity: 0.3 },
  dots: {
    width: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 3,
  },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.muted },
  dotActive: { backgroundColor: COLORS.goldBright },
});
