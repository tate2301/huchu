"use client";

import { useCallback, useEffect, useState } from "react";
import { reserveEntityId, type ReserveIdEntity } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

type UseReservedIdOptions = {
  entity: ReserveIdEntity;
  enabled: boolean;
  siteId?: string;
};

export function useReservedId(options: UseReservedIdOptions) {
  const { entity, enabled, siteId } = options;
  const [reservedId, setReservedId] = useState("");
  const [isReserving, setIsReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reserve = useCallback(async () => {
    if (!enabled) return "";
    setIsReserving(true);
    setError(null);
    try {
      const response = await reserveEntityId(entity, { siteId });
      setReservedId(response.code);
      return response.code;
    } catch (reservationError) {
      const message = getApiErrorMessage(reservationError);
      setError(message);
      setReservedId("");
      return "";
    } finally {
      setIsReserving(false);
    }
  }, [enabled, entity, siteId]);

  useEffect(() => {
    if (!enabled) {
      setReservedId("");
      setError(null);
      return;
    }
    void reserve();
  }, [enabled, reserve]);

  return {
    reservedId,
    isReserving,
    error,
    reserve,
    setReservedId,
  };
}

