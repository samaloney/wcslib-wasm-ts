# --- Configuration ---
WCS_VERSION = 8.5
WCS_TAR = wcslib-$(WCS_VERSION).tar.bz2
WCS_URL = https://www.atnf.csiro.au/computing/software/wcs/wcslib-releases/$(WCS_TAR)
VENDOR_DIR = ./vendor
WCS_DIR = $(VENDOR_DIR)/wcslib-$(WCS_VERSION)

# Output paths
OUT_DIR = ./src/lib/generated
JS_GLUE = $(OUT_DIR)/wcslib.js

# Emscripten Settings
EMCC = emcc
OPTIMIZE = -O3
# We export common WCS functions. Add more to this list as needed.
EXPORTED_FUNCS = "['_wcspih', '_wcsset', '_wcsp2s', '_wcss2p', '_malloc', '_free']"
EMCC_FLAGS = -s MODULARIZE=1 \
             -s EXPORT_ES6=1 \
             -s EXPORTED_FUNCTIONS=$(EXPORTED_FUNCS) \
             -s EXPORTED_RUNTIME_METHODS="['cwrap', 'ccall', 'getValue', 'setValue', 'HEAPU8', 'HEAPF64']"

# --- Targets ---

.PHONY: all clean

# Default task
all: build-wasm

# 1. Download the source tarball
fetch:
	@mkdir -p $(VENDOR_DIR)
	@if [ ! -f $(VENDOR_DIR)/$(WCS_TAR) ]; then \
		echo "🌐 Downloading wcslib $(WCS_VERSION)..."; \
		curl -L $(WCS_URL) -o $(VENDOR_DIR)/$(WCS_TAR); \
	else \
		echo "✅ Tarball already exists."; \
	fi

# 2. Extract the source
extract: fetch
	@if [ ! -d $(WCS_DIR) ]; then \
		echo "📦 Extracting source..."; \
		tar -vxjf $(VENDOR_DIR)/$(WCS_TAR) -C $(VENDOR_DIR); \
	else \
		echo "✅ Source already extracted."; \
	fi

# 3. Configure for Emscripten
# This creates the Makefile inside the vendor directory
$(WCS_DIR)/Makefile: extract
	@echo "🔧 Configuring wcslib-$(WCS_VERSION) for Emscripten..."
	cd $(WCS_DIR) && emconfigure ./configure --disable-fortran --without-cfitsio --without-pgplot

# 4. Compile the C static library
$(WCS_DIR)/C/libwcs-$(WCS_VERSION).a: $(WCS_DIR)/Makefile
	@echo "🔨 Building wcslib-$(WCS_VERSION) library..."
	cd $(WCS_DIR) && emmake make

# 5. Generate Wasm/JS Glue code
build-wasm: $(WCS_DIR)/C/libwcs-$(WCS_VERSION).a
	@echo "🚀 Compiling to WebAssembly..."
	@mkdir -p $(OUT_DIR)
	$(EMCC) $(OPTIMIZE) \
		-I$(WCS_DIR)/C \
		$(WCS_DIR)/C/libwcs-$(WCS_VERSION).a -lm \
		$(EMCC_FLAGS) -o $(OUT_DIR)/wcslib-$(WCS_VERSION).js
	@echo "✨ Success! Files generated in $(OUT_DIR)"

# Cleanup
clean:
	rm -rf $(OUT_DIR)
	@echo "Cleanup complete. (Vendor source left intact, use 'clean-vendor' for deep clean)"

clean-vendor:
	rm -rf $(VENDOR_DIR)