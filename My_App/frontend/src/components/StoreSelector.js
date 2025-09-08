// src/components/StoreSelector.js
import { Button, FormLabel, Select, Text, VStack } from "@chakra-ui/react";

export default function StoreSelector({
  storeList = [],
  selectedStore,
  setSelectedStore,
}) {
  const handleChange = (e) => {
    const v = Number(e.target.value);
    setSelectedStore(Number.isFinite(v) ? v : null);
  };

  const selected =
    storeList.find((s) => s.value === (selectedStore?.value ?? selectedStore)) ||
    null;

  return (
    <VStack align="stretch" spacing={3}>
      <FormLabel m={0}>Store</FormLabel>
      <Select
        placeholder="Choose a store"
        value={selected?.value ?? selectedStore ?? ""}
        onChange={handleChange}
      >
        {storeList.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>

      {selected && (
        <Text fontSize="sm" color="gray.600">
          You selected store <Text as="span" fontWeight="bold">{selected.value}</Text>
        </Text>
      )}

      <Button colorScheme="blue">Continue</Button>
    </VStack>
  );
}
