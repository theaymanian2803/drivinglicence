import { useEffect, useState } from 'react';
import { api } from './db';

export function useSitePublic(): boolean | null {
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  useEffect(() => {
    api.get<{ site_public: boolean }>('/settings/public').then((res) => {
      setIsPublic(res.data?.site_public ?? false);
    });
  }, []);
  return isPublic;
}
