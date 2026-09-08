#include <iostream>
using namespace std;

class Swap {
public:
    int a, b;
    void getData();
    void display();
};

void Swap::getData() {
    cout << "Enter two numbers: ";
    cin >> a >> b;
}

void Swap::display() {
    cout << "a = " << a << " b = " << b << endl;
}

int main() {
    Swap s1, s2;
    int temp;

    s1.getData();

    s2.a = s1.a;
    s2.b = s1.b;

    temp = s2.a;
    s2.a = s2.b;
    s2.b = temp;

    cout << "After swapping:\n";
    s2.display();

    return 0;
}