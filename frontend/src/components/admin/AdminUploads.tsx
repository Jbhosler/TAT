import AggregatedHoldingsUpload from './AggregatedHoldingsUpload';
import BulkUpload from './BulkUpload';
import RegistrationTypeUpload from './RegistrationTypeUpload';
import ProductEquivalents from './ProductEquivalents';

type AdminUploadsProps = {
  strategies?: { id: string; name: string }[];
  onStrategiesRefresh?: () => void;
};

/**
 * Admin front page: all upload types in one place.
 * Reduces top-level tab count by grouping uploads.
 */
const AdminUploads = ({ strategies = [], onStrategiesRefresh }: AdminUploadsProps) => {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Uploads</h2>
        <p className="mt-1 text-sm text-gray-500">
          Ingest aggregated holdings, update strategy positions, upload product equivalents, or upload registration types.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <AggregatedHoldingsUpload />
        <BulkUpload />
        <ProductEquivalents strategies={strategies} onStrategiesRefresh={onStrategiesRefresh} />
        <RegistrationTypeUpload />
      </div>
    </div>
  );
};

export default AdminUploads;
