import { Box, Flex, Heading, HStack, Badge, Text } from "@chakra-ui/react";

export default function PageHeader({ title, storeLabel }) {
  return (
    <Box mb={6}>
      <Flex align="center" justify="space-between">
        <Heading size="lg" fontWeight="800" letterSpacing="-0.02em">
          {title}
        </Heading>
        {!!storeLabel && (
          <HStack spacing={2}>
            <Badge colorScheme="brand" variant="subtle" rounded="md" px={3} py={1}>
              <Text fontWeight="700" fontSize="sm">{storeLabel}</Text>
            </Badge>
          </HStack>
        )}
      </Flex>
    </Box>
  );
}
