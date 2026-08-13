import { smartScanRoutes } from './smart-scan-core';
import { smartScanPromotionRoutes } from './smart-scan-promotion';
import { smartScanPromotionStatusRoutes } from './smart-scan-promotion-status';

smartScanRoutes.route('/', smartScanPromotionRoutes);
smartScanRoutes.route('/', smartScanPromotionStatusRoutes);

export { smartScanRoutes };
