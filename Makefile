# --- Configuration ---
WCS_VERSION = 8.5
WCS_TAR = wcslib-$(WCS_VERSION).tar.bz2
WCS_URL = https://www.atnf.csiro.au/computing/software/wcs/wcslib-releases/$(WCS_TAR)
VENDOR_DIR = ./vendor
WCS_DIR = $(VENDOR_DIR)/wcslib-$(WCS_VERSION)

# Output paths
OUT_DIR = ./src/lib/generated

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
all: $(OUT_DIR)/wcslib-$(WCS_VERSION).js

# 1. Download the source tarball
$(VENDOR_DIR)/$(WCS_TAR):
	@mkdir -p $(VENDOR_DIR)
	@echo "🌐 Downloading wcslib $(WCS_VERSION)..."
	@curl -L $(WCS_URL) -o $(VENDOR_DIR)/$(WCS_TAR)

# 2. Extract the source
$(WCS_DIR)/configure: $(VENDOR_DIR)/$(WCS_TAR)
	@echo "📦 Extracting source..."; \
	tar -xjf $(VENDOR_DIR)/$(WCS_TAR) -C $(VENDOR_DIR)
	# Need this or the wasm build breaks due to root package.json
	echo '{"type": "commonjs"}' > $(WCS_DIR)/package.json
	touch $(WCS_DIR)/configure

# 3. Configure for Emscripten
# This creates the Makefile inside the vendor directory
$(WCS_DIR)/config.status: $(WCS_DIR)/configure
	@echo "🔧 Configuring wcslib-$(WCS_VERSION) for Emscripten..."
	cd $(WCS_DIR) && emconfigure ./configure --disable-fortran --without-cfitsio --without-pgplot

# 4. Compile the C static library
$(WCS_DIR)/C/libwcs-$(WCS_VERSION).a: $(WCS_DIR)/config.status
	@echo "🔨 Building wcslib-$(WCS_VERSION) library..."
	cd $(WCS_DIR) && emmake make

# 5. Generate Wasm/JS Glue code
$(OUT_DIR)/wcslib-$(WCS_VERSION).js:  $(WCS_DIR)/C/libwcs-$(WCS_VERSION).a
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