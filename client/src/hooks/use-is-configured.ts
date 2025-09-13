import { useQuery } from '@tanstack/react-query';
import { client } from '@/api';
import { QueryKeys } from '@/constants/query-keys';

export const useIsConfigured = () => {
  const query = useQuery({
    queryKey: [QueryKeys.IS_CONFIGURED],
    queryFn: async () => {
      const req = await client.api.config['is-configured'].$get();
      const { isConfigured } = await req.json();
      return isConfigured;
    },
    retry: false,
  });
  return { ...query, isConfigured: query.data };
};
