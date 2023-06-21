#!/bin/bash

# Find all .py files in the current directory and its subdirectories
files=$(find . -name "*.ts")

# Count the total number of lines of code and Python classes in the files
total_lines=0
class_count=0
for file in $files; do
    lines=$(wc -l < "$file")
    total_lines=$((total_lines + lines))
    count=$(grep -c "^class" "$file")
    class_count=$((class_count + count))
done

# Print the total number of lines of code and Python classes
echo "Total number of lines of code in .ts files: $total_lines"
echo "Total number of TypeScript classes: $class_count"

