"""Tests for figureServer module."""

from pipeleyen.figureServer import fbIsFigureFile, fsMimeTypeForFile


class TestFbIsFigureFile:
    def test_pdfIsRecognized(self):
        assert fbIsFigureFile("plot.pdf") is True

    def test_pngIsRecognized(self):
        assert fbIsFigureFile("chart.png") is True

    def test_jpgIsRecognized(self):
        assert fbIsFigureFile("photo.jpg") is True

    def test_jpegIsRecognized(self):
        assert fbIsFigureFile("photo.jpeg") is True

    def test_svgIsRecognized(self):
        assert fbIsFigureFile("diagram.svg") is True

    def test_npyIsNotFigure(self):
        assert fbIsFigureFile("data.npy") is False

    def test_jsonIsNotFigure(self):
        assert fbIsFigureFile("config.json") is False

    def test_noExtension(self):
        assert fbIsFigureFile("Makefile") is False


class TestFsMimeTypeForFile:
    def test_pdfMimeType(self):
        assert fsMimeTypeForFile("x.pdf") == "application/pdf"

    def test_pngMimeType(self):
        assert fsMimeTypeForFile("x.png") == "image/png"

    def test_jpgMimeType(self):
        assert fsMimeTypeForFile("x.jpg") == "image/jpeg"

    def test_svgMimeType(self):
        assert fsMimeTypeForFile("x.svg") == "image/svg+xml"

    def test_unknownExtension(self):
        assert (
            fsMimeTypeForFile("x.xyz") == "application/octet-stream"
        )
