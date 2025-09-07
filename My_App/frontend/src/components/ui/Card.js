import { Box, Heading } from "@chakra-ui/react";

export const Card = ({ children, ...props }) => (
  <Box
    bg="white"
    borderWidth="1px"
    borderRadius="xl"
    shadow="sm"
    {...props}
  >
    {children}
  </Box>
);

export const CardHeader = ({ title, right, ...props }) => (
  <Box
    px={4}
    pt={3}
    pb={2}
    borderBottom="1px solid"
    borderColor="gray.100"
    display="flex"
    alignItems="center"
    justifyContent="space-between"
    {...props}
  >
    <Heading as="h3" size="sm" fontWeight="semibold" color="gray.700">
      {title}
    </Heading>
    {right}
  </Box>
);

export const CardBody = (props) => <Box px={4} py={3} {...props} />;
