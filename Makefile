.PHONY: clean

FILENAME_WITH_EXTENSION=$(shell ls | grep *.tex)
FILENAME=$(basename $(notdir $(FILENAME_WITH_EXTENSION)))
PWD_DIR=$(shell pwd)

#all: clean citations compile 
all: clean compile 

citations:
	pdflatex $(FILENAME)
	bibtex   $(FILENAME)

compile: 
	pdflatex $(FILENAME)
	pdflatex $(FILENAME)

clean:
	rm -f $(PWD_DIR)/*.aux 
	rm -f $(PWD_DIR)/*.log 
	rm -f $(PWD_DIR)/*.out 
	rm -f $(PWD_DIR)/*.bbl 
	rm -f $(PWD_DIR)/*.blg 
	rm -f $(PWD_DIR)/*.lof
	rm -f $(PWD_DIR)/*.pdf
