import { Box, Stack, Text, Skeleton } from "@chakra-ui/react";

export default function StatCard({ label, value, hint, loading = false }) {
  return (
    <Box
      bgGradient="linear(to-br, white, gray.50)"
      borderWidth="1px"
      borderColor="gray.200"
      rounded="2xl"
      shadow="sm"
      p={5}
    >
      <Stack spacing={1}>
        <Text fontSize="sm" color="gray.500" fontWeight="600" letterSpacing="0.02em">
          {label}
        </Text>
        <Skeleton isLoaded={!loading}>
          <Text fontSize="3xl" fontWeight="900" letterSpacing="-0.02em">
            {value}
          </Text>
        </Skeleton>
        {hint ? (
          <Text fontSize="xs" color="gray.500" mt={1}>
            {hint}
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
}
