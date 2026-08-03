export interface GardenDataSourceStatus {
  id: string;
  label: string;
  available: boolean;
  description: string;
}

export interface GardenDataProvider {
  readonly status: GardenDataSourceStatus;
  importForLocation(input: { latitude: number; longitude: number }): Promise<{ features: unknown[] }>;
}

export class ManualGardenDataProvider implements GardenDataProvider {
  readonly status: GardenDataSourceStatus = {
    id: 'manual',
    label: 'Manuel kortlægning',
    available: true,
    description: 'Kortobjekter, planter og forhold registreres af brugeren.',
  };
  async importForLocation(): Promise<{ features: unknown[] }> { return { features: [] }; }
}

export function configuredGardenDataSources(): GardenDataSourceStatus[] {
  return [
    new ManualGardenDataProvider().status,
    {
      id: 'public-map-data',
      label: 'Offentlige kort- og terrændata',
      available: false,
      description: 'Providergrænsefladen er klar; datakilden vælges og aktiveres efter pilotafprøvning.',
    },
  ];
}
