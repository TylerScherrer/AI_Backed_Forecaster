import React, { useMemo, useState } from "react";
import {
  Drawer, DrawerOverlay, DrawerContent, DrawerHeader, DrawerBody,
  DrawerFooter, Button, VStack, HStack, Text, Slider, SliderTrack, SliderFilledTrack, SliderThumb
} from "@chakra-ui/react";

export default function WhatIfDrawer({ isOpen, onClose, categories = [], onApply }) {
  // categories: [{ name, value, pct }]
  const [deltas, setDeltas] = useState({}); // {name: +10 -> +10%}

  const adjusted = useMemo(() => {
    return categories.map(c => {
      const d = deltas[c.name] ?? 0;
      const newVal = c.value * (1 + d / 100);
      return { ...c, whatIfValue: newVal };
    });
  }, [categories, deltas]);

  const total = categories.reduce((s,c)=>s+(c.value||0),0);
  const totalWhatIf = adjusted.reduce((s,c)=>s+(c.whatIfValue||0),0);
  const deltaAbs = totalWhatIf - total;
  const deltaPct = total ? (deltaAbs / total) * 100 : 0;

  return (
    <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="md">
      <DrawerOverlay />
      <DrawerContent>
        <DrawerHeader>What-If: adjust category mix</DrawerHeader>
        <DrawerBody>
          <VStack align="stretch" spacing={4}>
            {categories.map(c => (
              <div key={c.name}>
                <HStack justify="space-between">
                  <Text fontWeight="medium">{c.name}</Text>
                  <Text>{(deltas[c.name] ?? 0).toFixed(0)}%</Text>
                </HStack>
                <Slider min={-30} max={30} step={1}
                        value={deltas[c.name] ?? 0}
                        onChange={(v)=>setDeltas(prev=>({...prev, [c.name]: v}))}>
                  <SliderTrack><SliderFilledTrack /></SliderTrack>
                  <SliderThumb />
                </Slider>
              </div>
            ))}
          </VStack>
        </DrawerBody>
        <DrawerFooter justifyContent="space-between">
          <Text fontSize="sm">
            Total impact: {deltaAbs.toLocaleString(undefined,{style:"currency",currency:"USD"})}
            {" "}({deltaPct.toFixed(1)}%)
          </Text>
          <HStack>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button colorScheme="blue" onClick={() => onApply?.(adjusted)}>Apply</Button>
          </HStack>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
