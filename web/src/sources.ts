export type SourceType = 'markdown' | 'text' | 'docx' | 'pdf';
export type SourceClassification = 'manuscript' | 'notes' | 'research' | 'reference' | 'archive' | 'other';
export type SourceAuthority = 'unknown' | 'historical' | 'working' | 'authoritative';
export type SourceExtractionStatus = 'pending' | 'ready' | 'partial' | 'failed';

export interface StorySource {
  id: string;
  title: string;
  originalName: string;
  sourceType: SourceType;
  classification: SourceClassification;
  authority: SourceAuthority;
  importedAt: string;
  updatedAt: string;
  sourceHash: string;
  extractionStatus: SourceExtractionStatus;
  extractionWarning?: string;
  textLength: number;
  chunkCount: number;
}

export interface SourceLocation {
  page?: number;
  heading?: string;
  paragraph?: number;
  start?: number;
  end?: number;
}

export interface SourceSearchHit {
  sourceId: string;
  chunkId: string;
  score: number;
  title: string;
  snippet: string;
  location: SourceLocation;
  retrievalMethod: 'lexical';
}

export interface SourceCitation {
  sourceId: string;
  title: string;
  chunkId: string;
  location: SourceLocation;
  snippet: string;
}
