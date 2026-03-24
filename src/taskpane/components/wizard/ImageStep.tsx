import React, { useRef, useState } from "react";
import { Button, Spinner, Text } from "@fluentui/react-components";
import { validateImageFile, resizeImageToBase64 } from "../../services/imageUtils";

interface ImageStepProps {
  imageBase64: string | null;
  onImageSelected: (base64: string) => void;
}

const ImageStep: React.FC<ImageStepProps> = ({ imageBase64, onImageSelected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const base64 = await resizeImageToBase64(file);
      onImageSelected(base64);
    } catch {
      setError("Failed to process image. Please try another file.");
    } finally {
      setLoading(false);
      // Reset input so the same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <Text weight="semibold" size={400}>
        Upload a product image
      </Text>
      <Text size={200} style={{ color: "#616161" }}>
        Add a PNG or JPG image to include on your slide
      </Text>

      <input
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        onChange={handleFileChange}
        style={{ display: "none" }}
        ref={fileInputRef}
      />

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "16px 0" }}>
          <Spinner size="small" label="Processing image..." />
        </div>
      )}

      {error && (
        <Text size={200} style={{ color: "#D13438" }}>
          {error}
        </Text>
      )}

      {imageBase64 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
          <img
            src={`data:image/png;base64,${imageBase64}`}
            alt="Uploaded product"
            style={{ maxWidth: "100%", maxHeight: "200px", borderRadius: "8px", objectFit: "contain" }}
          />
          <Button size="small" onClick={triggerUpload}>
            Replace image
          </Button>
        </div>
      ) : (
        !loading && (
          <Button appearance="primary" onClick={triggerUpload} style={{ alignSelf: "flex-start" }}>
            Upload Product Image
          </Button>
        )
      )}
    </div>
  );
};

export default ImageStep;
