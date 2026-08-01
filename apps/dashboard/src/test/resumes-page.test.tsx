import { afterEach, describe, expect, it, vi } from 'vitest';
import ResumesPage from '@/app/(dashboard)/resumes/page';
import { flushUpdates, renderView, RenderedView } from './render';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@/lib/api/hooks/use-resumes', () => ({
  useResumes: () => ({
    resumes: {
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    },
    upload: {
      mutateAsync: mocks.upload,
      isPending: false,
    },
    remove: {
      mutateAsync: mocks.remove,
      isPending: false,
    },
  }),
}));

let view: RenderedView | undefined;

afterEach(() => {
  view?.cleanup();
  view = undefined;
});

describe('ResumesPage', () => {
  it('passes the selected CV to the upload mutation', async () => {
    mocks.upload.mockResolvedValue({ id: 'resume-1' });
    view = renderView(<ResumesPage />);
    const input = view.required<HTMLInputElement>('input[type="file"]');
    const file = new File(['%PDF-test'], 'sara-cv.pdf', {
      type: 'application/pdf',
    });

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushUpdates();

    expect(mocks.upload).toHaveBeenCalledWith(file);
  });

  it('shows backend file-validation failures without hiding the empty state', async () => {
    mocks.upload.mockRejectedValue(
      new Error('Only PDF and DOCX resumes are supported'),
    );
    view = renderView(<ResumesPage />);
    const input = view.required<HTMLInputElement>('input[type="file"]');
    const file = new File(['plain text'], 'resume.txt', {
      type: 'text/plain',
    });

    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushUpdates();

    expect(view.required<HTMLElement>('[role="alert"]').textContent).toContain(
      'Only PDF and DOCX resumes are supported',
    );
    expect(view.container.textContent).toContain('No resumes yet');
  });
});
